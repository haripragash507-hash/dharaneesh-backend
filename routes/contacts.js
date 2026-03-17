const express = require('express');
const Contact = require('../models/Contact');
const auth    = require('../middleware/auth');

const router = express.Router();

// GET /contacts
router.get('/', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id }).sort({ addedAt: -1 });
    res.json({ contacts });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /contacts
router.post('/', auth, async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });

  try {
    const contact = await Contact.create({ userId: req.user._id, name: name.trim(), email });
    res.status(201).json({ contact });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /contacts/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Contact removed' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
