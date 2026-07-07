'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SITE_DIR = path.join(ROOT_DIR, 'site');

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(cors());

app.use(
  express.json({
    limit: '1mb',
  })
);

app.use('/site', express.static(SITE_DIR));

app.use('/public', express.static(PUBLIC_DIR));

// Оставляем также доступ к файлам без /public, чтобы не ломать старые ассеты/проверки.
app.use(express.static(PUBLIC_DIR));

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
    const status = String(req.query.status || '').toLowerCase();
    const category = String(req.query.category || '').toLowerCase();

    const where = {};

    if (status === 'published') {
      where.isPublished = true;
    }

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
        isPublished: true,
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

    res.json({
      post,
    });
  } catch (error) {
    next(error);
  }
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

  res.status(500).json({
    message: 'Server error',
  });
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`NADIA server started: http://localhost:${PORT}`);
});
