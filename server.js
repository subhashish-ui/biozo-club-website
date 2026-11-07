require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'biozo.db');

app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.APP_URL}/auth/google/callback`
},
(accessToken, refreshToken, profile, done) => {
  const email = profile.emails?.[0]?.value?.toLowerCase();

  if (!email) {
    return done(null, false);
  }

  db.get(
    'SELECT email, role FROM admin_users WHERE email = ?',
    [email],
    (err, admin) => {
      if (err) return done(err);
      if (!admin) return done(null, false);

      return done(null, {
        email: admin.email,
        name: profile.displayName,
        role: admin.role
      });
    }
  );
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

console.log('Google login route registered');
// Start Google login
app.get('/auth/google',
  console.log('Google login route hit');
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google login callback
app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login.html'
  }),
  (req, res) => {
    res.redirect('/admin.html');
  }
);

// Logout
app.get('/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);

    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

function requireAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.redirect('/login.html');
}

function requireSuperAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'super_admin') {
    return next();
  }
  return res.status(403).json({ error: 'Super Admin access required' });
}

// Protect admin dashboard
app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Block access to private project files
app.use((req, res, next) => {
  const blockedFiles = [
    '/biozo.db',
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/.env'
  ];

  if (blockedFiles.includes(req.path)) {
    return res.status(404).send('Not found');
  }

  next();
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'biozo9.html'));
});

const db = new sqlite3.Database(DB_FILE, err => {
  if (err) {
    console.error('Unable to open database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      fullName TEXT,
      studentId TEXT,
      email TEXT,
      wing TEXT,
      message TEXT,
      submittedAt TEXT,
      payload TEXT
    )
  `);
  db.run(`
  CREATE TABLE IF NOT EXISTS admin_users (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    addedAt TEXT
  )
`);
db.run(
  `INSERT OR IGNORE INTO admin_users (email, role, addedAt)
   VALUES (?, ?, ?)`,
  [
    'biozoclub@gmail.com',
    'super_admin',
    new Date().toISOString()
  ]
);
db.run(
  `INSERT OR IGNORE INTO admin_users (email, role, addedAt)
   VALUES (?, ?, ?)`,
  [
    'guy82198@gmail.com',
    'admin',
    new Date().toISOString()
  ]
);
});


const updatesData = [
  { id: 1, type: 'news', title: "BioHack '24 Results", date: 'Feb 15, 2026', content: "Team 'Helix' won 1st place with their DNA-based storage encryption algorithm.", icon: '🏆' },
  { id: 2, type: 'event', title: 'CRISPR Workshop', date: 'Feb 28, 2026', content: 'Hands-on session on gene editing tools. Open to all branches. Venue: Lab 304.', icon: '🔬' },
  { id: 3, type: 'news', title: 'Induction Phase 1', date: 'Mar 01, 2026', content: 'Applications open today! Check the induction portal to apply.', icon: '📢' },
  { id: 4, type: 'event', title: 'Guest Lecture: AI in Pharma', date: 'Mar 10, 2026', content: 'Dr. S. Rao from Novozymes will speak on ML models for drug discovery.', icon: '💊' }
];

app.get('/api/updates', (req, res) => {
  const type = req.query.type;
  if (!type || type === 'all') return res.json(updatesData);
  return res.json(updatesData.filter(item => item.type === type));
});

app.get('/api/stats', requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) AS totalApplications FROM applications', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error retrieving stats.' });
    }
    return res.json({ totalApplications: row.totalApplications || 0 });
  });
});

app.get('/api/me', requireAdmin, (req, res) => {
  res.json({
    email: req.user.email,
    role: req.user.role
  });
});

app.get('/api/admins', requireSuperAdmin, (req, res) => {
  db.all(
    'SELECT email, role, addedAt FROM admin_users ORDER BY addedAt DESC',
    [],
    (err, admins) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(admins);
    }
  );
});

app.post('/api/admins', requireSuperAdmin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!/^[^\s@]+@gmail\.com$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid Gmail address' });
  }

  if (email === 'biozoclub@gmail.com') {
    return res.status(400).json({ error: 'This account is already Super Admin' });
  }

  db.run(
    `INSERT INTO admin_users (email, role, addedAt)
     VALUES (?, 'admin', ?)
     ON CONFLICT(email) DO UPDATE SET role = 'admin'`,
    [email, new Date().toISOString()],
    err => {
      if (err) return res.status(500).json({ error: 'Could not add admin' });
      res.json({ message: 'Admin added successfully' });
    }
  );
});

app.delete('/api/admins/:email', requireSuperAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();

  if (email === 'biozoclub@gmail.com') {
    return res.status(400).json({ error: 'Cannot remove the Super Admin' });
  }

  db.run(
    'DELETE FROM admin_users WHERE email = ? AND role = ?',
    [email, 'admin'],
    function (err) {
      if (err) return res.status(500).json({ error: 'Could not remove admin' });
      if (!this.changes) return res.status(404).json({ error: 'Admin not found' });
      res.json({ message: 'Admin removed successfully' });
    }
  );
});

app.get('/api/applications', requireAdmin, (req, res) => {
  db.all('SELECT id, fullName, studentId, email, wing, submittedAt FROM applications ORDER BY submittedAt DESC LIMIT 100', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error reading applications.' });
    }
    return res.json(rows);
  });
});

app.post('/api/applications', (req, res) => {
  const { fullName, studentId, email, wing, message, _id, _submittedAt } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ error: 'fullName and email are required.' });
  }

  const id = _id || `app_${Date.now()}`;
  const submittedAt = _submittedAt || new Date().toISOString();
  const payload = JSON.stringify(req.body);

  const statement = db.prepare(`
    INSERT OR REPLACE INTO applications (id, fullName, studentId, email, wing, message, submittedAt, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(id, fullName, studentId || '', email, wing || '', message || '', submittedAt, payload, function (err) {
    if (err) {
      console.error('Error saving application:', err);
      return res.status(500).json({ error: 'Unable to save application.' });
    }

    return res.status(201).json({ id, fullName, studentId, email, wing, message, submittedAt });
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
