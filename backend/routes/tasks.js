const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { WEIGHTS } = require('../config/constants');
const { calculateWorkloadScores } = require('../services/workload');
const { predictBurnout } = require('../services/burnout');
const { authMiddleware } = require('./auth');

// ============================================
// HELPER: CHECK IF STUDENT CAN ADD TASK
// ============================================
async function canAddTask(studentId, taskData) {
  try {
    // Get current burnout status
    const burnoutAnalysis = await predictBurnout(studentId);
    const { score, risk } = burnoutAnalysis;

    const effort = taskData.estimatedEffort || 0;
    const type = taskData.type || 'default';
    const isMajorTask = ['exam', 'project'].includes(type);

    // ============================================
    // SCORE ≥ 60 (HIGH RISK) - STRICT BLOCKING
    // ============================================
    if (score >= 60) {
      // Block ALL major tasks (exams, projects)
      if (isMajorTask) {
        return {
          allowed: false,
          reason: `🛑 Your burnout risk is CRITICAL (${score}/100). You cannot add exams or projects right now.`,
          recommendations: [
            'Focus on completing existing commitments first',
            'Contact your proctor for academic support',
            'Visit VIT Counseling Center: AB2 Building',
            'Consider requesting deadline extensions from instructors'
          ],
          currentScore: score,
          currentRisk: risk
        };
      }

      // Block high-effort tasks (>5 hours)
      if (effort > 5) {
        return {
          allowed: false,
          reason: `🛑 Your burnout risk is CRITICAL (${score}/100). Tasks requiring ${effort}+ hours will worsen your condition.`,
          recommendations: [
            'Break this task into smaller chunks (<3 hours each)',
            'Postpone non-urgent assignments',
            'Seek help from peers or tutors',
            'Prioritize recovery before taking on new work'
          ],
          currentScore: score,
          currentRisk: risk
        };
      }
    }

    // ============================================
    // SCORE 40-59 (MEDIUM-HIGH RISK) - MODERATE BLOCKING
    // ============================================
    if (score >= 40) {
      // Block very high-effort tasks (>8 hours)
      if (effort > 8) {
        return {
          allowed: false,
          reason: `⚠️ Your burnout risk is ELEVATED (${score}/100). Adding ${effort}-hour tasks may push you into critical territory.`,
          recommendations: [
            'Split this into multiple smaller tasks',
            'Space out deadlines if possible',
            'Current workload should stabilize before adding more',
            'Review stress management strategies'
          ],
          currentScore: score,
          currentRisk: risk
        };
      }

      // Warn for exams/projects
      if (isMajorTask && effort > 5) {
        return {
          allowed: true,
          warning: true,
          reason: `⚠️ CAUTION: Your burnout risk is ${score}/100. Adding this ${type} may increase stress significantly.`,
          recommendations: [
            'Ensure adequate preparation time',
            'Don\'t schedule other major tasks in the same week',
            'Plan recovery time after completion',
            'Monitor your stress levels closely'
          ],
          currentScore: score,
          currentRisk: risk
        };
      }
    }

    // ============================================
    // SCORE 30-39 (MEDIUM RISK) - SOFT WARNINGS
    // ============================================
    if (score >= 30) {
      if (isMajorTask) {
        return {
          allowed: true,
          warning: true,
          reason: `⚠️ Your burnout risk is MEDIUM (${score}/100). Be cautious about overcommitting.`,
          recommendations: [
            'Plan this task carefully',
            'Avoid clustering multiple deadlines',
            'Maintain healthy work-rest balance'
          ],
          currentScore: score,
          currentRisk: risk
        };
      }
    }

    // ============================================
    // SCORE < 30 (LOW RISK) - ALL CLEAR
    // ============================================
    return {
      allowed: true,
      warning: false,
      currentScore: score,
      currentRisk: risk
    };

  } catch (error) {
    console.error('Task validation error:', error);
    // On error, allow (don't block functionality)
    return { allowed: true, warning: false };
  }
}

// ============================================
// GET ALL TASKS
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ studentId: req.userId }).sort({ deadline: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CREATE TASK (WITH BURNOUT VALIDATION)
// ============================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, type, subject, deadline, estimatedEffort } = req.body;

    // ✅ NEW: Check if student can add this task
    const validation = await canAddTask(req.userId, { type, estimatedEffort });

    // BLOCKED
    if (!validation.allowed) {
      return res.status(403).json({
        error: 'Task creation blocked',
        blocked: true,
        reason: validation.reason,
        recommendations: validation.recommendations,
        currentScore: validation.currentScore,
        currentRisk: validation.currentRisk
      });
    }

    // Calculate weight based on type
    const weight = WEIGHTS[type] || WEIGHTS.default;

    // Create task
    const task = await Task.create({
      studentId: req.userId,
      title,
      type,
      subject,
      deadline: new Date(deadline),
      estimatedEffort,
      weight
    });

    // Recalculate workload scores
    const taskDate = new Date(deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    // Prepare response
    const response = {
      task,
      message: 'Task created successfully'
    };

    // Add warning if applicable
    if (validation.warning) {
      response.warning = validation.reason;
      response.recommendations = validation.recommendations;
      response.burnoutScore = validation.currentScore;
    }

    res.status(201).json(response);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UPDATE TASK
// ============================================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, type, subject, deadline, estimatedEffort, completed } = req.body;

    const weight = type ? (WEIGHTS[type] || WEIGHTS.default) : undefined;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, studentId: req.userId },
      {
        ...(title && { title }),
        ...(type && { type, weight }),
        ...(subject && { subject }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(estimatedEffort !== undefined && { estimatedEffort }),
        ...(completed !== undefined && { completed })
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Recalculate workload scores
    const taskDate = new Date(task.deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE TASK
// ============================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      studentId: req.userId
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Recalculate workload scores
    const taskDate = new Date(task.deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;