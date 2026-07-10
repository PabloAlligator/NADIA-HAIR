'use strict';

const path = require('path');
const express = require('express');

const requireAuth = require('../middleware/require-auth');
const requireRole = require('../middleware/require-role');

const router = express.Router();

const ADMIN_PAGES_DIR = path.join(
  __dirname,
  '..',
  'admin-pages',
);

function sendAdminPage(fileName) {
  return function adminPageHandler(req, res) {
    return res.sendFile(
      path.join(ADMIN_PAGES_DIR, fileName),
    );
  };
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  next();
});

/*
 * Корень админки.
 * Пока отправляем на страницу входа.
 */
router.get('/', (req, res) => {
  return res.redirect(303, '/admin/login');
});

/*
 * Публичная страница входа.
 */
router.get(
  ['/login', '/login.html'],
  sendAdminPage('login.html'),
);

/*
 * Dashboard — только OWNER.
 */
router.get(
  ['/dashboard', '/dashboard.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('dashboard.html'),
);

/*
 * Заявки — OWNER и STAFF.
 */
router.get(
  ['/requests', '/requests.html'],
  requireAuth.page,
  requireRole.page('OWNER', 'STAFF'),
  sendAdminPage('requests.html'),
);

/*
 * Работы — только OWNER.
 */
router.get(
  ['/works', '/works-ad.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('works-ad.html'),
);

router.get(
  ['/works/edit', '/works-ad-edit.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('works-ad-edit.html'),
);

/*
 * Статьи — только OWNER.
 */
router.get(
  ['/blog', '/blog-ad.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('blog-ad.html'),
);

router.get(
  ['/blog/edit', '/blog-ad-edit.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('blog-ad-edit.html'),
);

/*
 * Не отправляем публичную главную сайта
 * при неизвестном адресе внутри /admin.
 */
router.use((req, res) => {
  return res.status(404).send(
    'Страница админки не найдена',
  );
});

module.exports = router;
