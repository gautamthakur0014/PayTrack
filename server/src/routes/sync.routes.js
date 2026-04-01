'use strict';

const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense.model');
const { protect } = require('../middleware/auth.middleware');
const { invalidatePattern } = require('../config/redis');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');

/**
 * POST /api/v1/sync/push
 * Accept a batch of offline operations and apply them server-side.
 * Supports: create, update, delete operations.
 * Returns map of localId -> serverId for client to reconcile IndexedDB.
 *
 * Body: { operations: [{ op: 'create'|'update'|'delete', data: {...} }] }
 */
router.post('/push', protect, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { operations } = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ success: false, message: 'No operations provided' });
  }

  const results = [];
  const errors = [];

  for (const operation of operations) {
    try {
      const { op, data } = operation;

      if (op === 'create') {
        // Idempotent create — skip if already synced
        if (data.localId) {
          const existing = await Expense.findOne({ localId: data.localId, ownerId: userId });
          if (existing) {
            results.push({ localId: data.localId, serverId: existing._id, op: 'skipped' });
            continue;
          }
        }

        const { _id, ...cleanData } = data; // strip client-side _id
        const expense = await Expense.create({
          ...cleanData,
          ownerId: userId,
          syncedAt: new Date(),
        });

        results.push({ localId: data.localId, serverId: expense._id, op: 'created' });

      } else if (op === 'update') {
        const updated = await Expense.findOneAndUpdate(
          { _id: data._id, ownerId: userId },
          { ...data, syncedAt: new Date() },
          { new: true }
        );
        results.push({
          localId: data.localId,
          serverId: data._id,
          op: updated ? 'updated' : 'not_found',
        });

      } else if (op === 'delete') {
        await Expense.findOneAndUpdate(
          { _id: data._id, ownerId: userId },
          { isDeleted: true, deletedAt: new Date() }
        );
        results.push({ localId: data.localId, serverId: data._id, op: 'deleted' });

      } else {
        errors.push({ localId: data?.localId, error: `Unknown operation: ${op}` });
      }
    } catch (err) {
      logger.error('Sync push operation error:', err.message);
      errors.push({ localId: operation.data?.localId, error: err.message });
    }
  }

  await invalidatePattern(`expenses:${userId}:*`);
  await invalidatePattern(`balance:${userId}`);
  await invalidatePattern(`monthly:${userId}:*`);

  res.status(200).json({
    success: true,
    data: { results, errors, syncedAt: new Date() },
  });
}));

/**
 * GET /api/v1/sync/pull?since=ISO_DATE
 * Pull all expenses created/updated after a given timestamp.
 * Used to hydrate the client's IndexedDB on app start or reconnect.
 */
router.get('/pull', protect, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { since } = req.query;

  const sinceDate = since
    ? new Date(since)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: last 7 days

  const expenses = await Expense.find({
    ownerId: userId,
    $or: [
      { updatedAt: { $gt: sinceDate } },
      { createdAt: { $gt: sinceDate } },
    ],
  })
    .populate('members.userId', 'username displayName avatar avatarColor')
    .populate('groupId', 'name avatarColor')
    .lean()
    .limit(500);

  res.status(200).json({
    success: true,
    data: { expenses, pulledAt: new Date() },
  });
}));

module.exports = router;
