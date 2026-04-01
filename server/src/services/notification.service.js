'use strict';

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const { sendPushNotification } = require('../config/webpush');
const { getClient } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Create a notification record and optionally send push notification.
 */
async function createNotification({ recipientId, senderId, type, title, body, data = {} }) {
  const notification = await Notification.create({
    recipientId,
    senderId,
    type,
    title,
    body,
    data,
  });

  // Enqueue push notification
  try {
    const redis = getClient();
    await redis.rpush('push:queue', JSON.stringify({
      recipientId: recipientId.toString(),
      notificationId: notification._id.toString(),
      title,
      body,
      data,
    }));
  } catch (err) {
    logger.warn('Failed to enqueue push notification:', err.message);
    // Non-fatal — send directly
    await sendDirectPush(recipientId, { title, body, data });
  }

  return notification;
}

/**
 * Send push notification directly to all subscriptions of a user.
 */
async function sendDirectPush(userId, payload) {
  try {
    const user = await User.findById(userId).select('pushSubscriptions').lean();
    if (!user?.pushSubscriptions?.length) return;

    const results = await Promise.allSettled(
      user.pushSubscriptions.map(sub => sendPushNotification(sub, payload))
    );

    // Remove expired subscriptions
    const expiredIndexes = results
      .map((r, i) => (r.status === 'fulfilled' && r.value?.expired ? i : -1))
      .filter(i => i !== -1);

    if (expiredIndexes.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { pushSubscriptions: { endpoint: { $in: expiredIndexes.map(i => user.pushSubscriptions[i].endpoint) } } } }
      );
    }
  } catch (err) {
    logger.error('Direct push error:', err.message);
  }
}

/**
 * Send bulk payment requests to expense members.
 */
async function sendBulkPaymentRequest(expense, members, requester) {
  const notifications = members.map(member => createNotification({
    recipientId: member.userId._id || member.userId,
    senderId: requester.id,
    type: 'payment_request',
    title: 'Payment Request',
    body: `${requester.displayName || requester.username} is requesting ${expense.currency} ${member.amount} for "${expense.description}"`,
    data: {
      expenseId: expense._id,
      amount: member.amount,
      currency: expense.currency,
    },
  }));

  return Promise.allSettled(notifications);
}

module.exports = { createNotification, sendDirectPush, sendBulkPaymentRequest };
