'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await seedBlogPosts();
}

async function seedBlogPosts() {
  const posts = [
    {
      slug: 'kak-sohranit-cvet-posle-okrashivaniya',
      title: 'Как сохранить цвет после окрашивания',
      excerpt:
        'Разбираем мягкий домашний уход, температуру воды и средства, которые помогают цвету оставаться красивым дольше.',
      content: `
        <p>Красивый цвет после окрашивания держится дольше, если сразу подобрать мягкий уход и не перегружать волосы агрессивными средствами.</p>
        <p>Первое правило — использовать шампунь для окрашенных волос, не мыть голову слишком горячей водой и обязательно добавлять кондиционер или маску.</p>
        <p>Также важно не использовать слишком горячий фен без термозащиты. Волосы после окрашивания требуют более деликатного отношения.</p>
      `,
      category: 'Окрашивание',
      categorySlug: 'coloring',
      coverImage: '/site/img/blog/blog-hero.png',
      readingTime: '4 мин',
      isPublished: true,
      publishedAt: new Date('2026-07-07T10:00:00.000Z'),
    },
    {
      slug: 'domashniy-uhod-posle-salona',
      title: 'Домашний уход после салона',
      excerpt:
        'Что делать дома, чтобы волосы оставались мягкими, блестящими и ухоженными не только в день визита.',
      content: `
        <p>Домашний уход — это продолжение салонного результата. Он помогает сохранить мягкость, блеск и аккуратный внешний вид волос.</p>
        <p>После визита в салон важно использовать подходящий шампунь, кондиционер, маску и термозащиту.</p>
      `,
      category: 'Домашний уход',
      categorySlug: 'home-care',
      coverImage: '/site/img/blog/blog-hero.png',
      readingTime: '3 мин',
      isPublished: true,
      publishedAt: new Date('2026-07-06T10:00:00.000Z'),
    },
    {
      slug: 'chto-takoe-airtouch',
      title: 'Что такое AirTouch и кому он подходит',
      excerpt:
        'Коротко и понятно о технике AirTouch: зачем она нужна, какой эффект даёт и почему выглядит так естественно.',
      content: `
        <p>AirTouch — это техника окрашивания, в которой часть коротких волос выдувается феном, а осветление наносится более мягко и выборочно.</p>
        <p>Такой подход помогает создать плавные переходы цвета и более естественный результат без резких полос.</p>
      `,
      category: 'AirTouch',
      categorySlug: 'airtouch',
      coverImage: '/site/img/blog/blog-hero.png',
      readingTime: '5 мин',
      isPublished: true,
      publishedAt: new Date('2026-07-05T10:00:00.000Z'),
    },
  ];

  for (const post of posts) {
    await prisma.blogPost.upsert({
      where: {
        slug: post.slug,
      },
      update: post,
      create: post,
    });

    console.log(`Статья добавлена/обновлена: ${post.title}`);
  }
}

main()
  .then(async () => {
    console.log('Seed выполнен успешно.');
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Ошибка seed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
