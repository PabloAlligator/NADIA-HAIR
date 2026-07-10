'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const prisma = require('./lib/prisma');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SITE_DIR = path.join(ROOT_DIR, 'site');

if (IS_PRODUCTION) {
  // Один доверенный reverse proxy: Nginx.
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
  helmet({
    // CSP настроим отдельным шагом после проверки всех внешних
    // скриптов, шрифтов и inline-фрагментов текущей вёрстки.
    contentSecurityPolicy: false,
  }),
);

app.use(
  express.json({
    limit: '100kb',
    strict: true,
  }),
);

app.use(cookieParser());

app.use('/site', express.static(SITE_DIR));
app.use('/public', express.static(PUBLIC_DIR));

// Оставляем доступ к старым путям ассетов без /public.
app.use(express.static(PUBLIC_DIR));

app.use('/admin/api/auth', authRoutes);

app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'NADIA API is working',
  });
});

app.get('/api/blog-posts', async (req, res, next) => {
  try {
    const category = String(req.query.category || '')
      .trim()
      .toLowerCase();

    const where = {
      isPublished: true,
    };

    if (category && category !== 'all') {
      where.categorySlug = category;
    }

    const posts = await prisma.blogPost.findMany({
      where,
      orderBy: [
        {
          publishedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        category: true,
        categorySlug: true,
        coverImage: true,
        publishedAt: true,
        readingTime: true,
      },
    });

    res.json({
      posts,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/blog-posts/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();

    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true,
      },
    });

    if (!post) {
      return res.status(404).json({
        message: 'Статья не найдена',
      });
    }

    return res.json({
      post,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/works', async (req, res, next) => {
  try {
    const category = String(req.query.category || '')
      .trim()
      .toLowerCase();
    const home = String(req.query.home || '').toLowerCase();

    const where = {
      isPublished: true,
    };

    if (home === 'true') {
      where.showOnHome = true;
    }

    if (category && category !== 'all') {
      where.categorySlug = category;
    }

    const works = await prisma.work.findMany({
      where,
      orderBy: [
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        category: true,
        categorySlug: true,
        beforeImage: true,
        afterImage: true,
        technique: true,
        duration: true,
        showOnHome: true,
        createdAt: true,
      },
    });

    return res.json({
      works,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/works/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();

    const work = await prisma.work.findFirst({
      where: {
        slug,
        isPublished: true,
      },
    });

    if (!work) {
      return res.status(404).json({
        message: 'Работа не найдена',
      });
    }

    return res.json({
      work,
    });
  } catch (error) {
    return next(error);
  }
});

app.use('/admin/api', (req, res) => {
  res.status(404).json({
    message: 'Admin API route not found',
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    message: 'API route not found',
  });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    message: 'Server error',
  });
});

async function shutdown(signal) {
  console.log(`${signal}: завершение работы NADIA server`);

  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});

app.listen(PORT, () => {
  console.log(`NADIA server started: http://localhost:${PORT}`);
});
