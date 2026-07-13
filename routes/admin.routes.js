'use strict';

const path = require('path');
const express = require('express');
const { z } = require('zod');

const prisma = require('../lib/prisma');

const requireAuth = require('../middleware/require-auth');
const requireRole = require('../middleware/require-role');
const requireCsrf = require('../middleware/require-csrf');
const validateOrigin = require('../middleware/validate-origin');

const {
  getRequestMetadata,
} = require('../services/session.service');

const router = express.Router();

const ADMIN_PAGES_DIR = path.join(
  __dirname,
  '..',
  'admin-pages',
);

const LEAD_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

const leadSelect = {
  id: true,
  name: true,
  phone: true,
  service: true,
  message: true,
  status: true,
  internalComment: true,
  source: true,
  consentAccepted: true,
  consentAcceptedAt: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,

  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
};

// параметры списка заявок

const leadListQuerySchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),

    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .default(''),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .optional()
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20),
  })
  .strict();

// id заявки

const leadIdSchema = z.coerce
  .number()
  .int()
  .positive();

// изменение заявки

const updateLeadSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),

    internalComment: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.status !== undefined ||
      data.internalComment !== undefined,
    {
      message: 'Не переданы данные для обновления заявки',
    },
  );

function sendAdminPage(fileName) {
  return function adminPageHandler(req, res) {
    return res.sendFile(
      path.join(ADMIN_PAGES_DIR, fileName),
    );
  };
}

function createLeadCounts(groupedStatuses) {
  const counts = {
    all: 0,
    NEW: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  for (const item of groupedStatuses) {
    const count = item._count?._all || 0;

    counts[item.status] = count;
    counts.all += count;
  }

  return counts;
}

// запрещаем кэширование админки

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  next();
});

// получение заявок

router.get(
  '/api/leads',
  requireAuth,
  requireRole('OWNER', 'STAFF'),
  async (req, res, next) => {
    try {
      const parsed = leadListQuerySchema.safeParse(
        req.query,
      );

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Некорректные параметры списка заявок',
        });
      }

      const {
        status,
        search,
        page,
        limit,
      } = parsed.data;

      const where = {};

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          {
            name: {
              contains: search,
            },
          },
          {
            phone: {
              contains: search,
            },
          },
          {
            service: {
              contains: search,
            },
          },
          {
            message: {
              contains: search,
            },
          },
        ];
      }

      const skip = (page - 1) * limit;

      const [
        leads,
        total,
        groupedStatuses,
      ] = await prisma.$transaction([
        prisma.lead.findMany({
          where,

          orderBy: [
            {
              createdAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],

          skip,
          take: limit,

          select: leadSelect,
        }),

        prisma.lead.count({
          where,
        }),

        prisma.lead.groupBy({
          by: ['status'],

          _count: {
            _all: true,
          },
        }),
      ]);

      return res.json({
        leads,

        counts: createLeadCounts(
          groupedStatuses,
        ),

        pagination: {
          page,
          limit,
          total,

          pages: Math.max(
            1,
            Math.ceil(total / limit),
          ),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

// изменение заявки

router.patch(
  '/api/leads/:id',
  validateOrigin,
  requireAuth,
  requireRole('OWNER', 'STAFF'),
  requireCsrf,
  async (req, res, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(
        req.params.id,
      );

      if (!parsedId.success) {
        return res.status(400).json({
          message: 'Некорректный ID заявки',
        });
      }

      const parsedBody = updateLeadSchema.safeParse(
        req.body,
      );

      if (!parsedBody.success) {
        return res.status(400).json({
          message:
            'Проверьте данные для обновления заявки',
        });
      }

      const leadId = parsedId.data;

      const currentLead =
        await prisma.lead.findUnique({
          where: {
            id: leadId,
          },

          select: {
            id: true,
            status: true,
            internalComment: true,
            assignedToId: true,
          },
        });

      if (!currentLead) {
        return res.status(404).json({
          message: 'Заявка не найдена',
        });
      }

      const updateData = {};

      if (parsedBody.data.status !== undefined) {
        updateData.status =
          parsedBody.data.status;
      }

      if (
        parsedBody.data.internalComment !==
        undefined
      ) {
        updateData.internalComment =
          parsedBody.data.internalComment;
      }

      // назначаем заявку сотруднику

      if (
        parsedBody.data.status ===
          'IN_PROGRESS' &&
        !currentLead.assignedToId
      ) {
        updateData.assignedToId =
          req.auth.user.id;
      }

      const metadata =
        getRequestMetadata(req);

      const auditDetails = {
        statusChanged:
          parsedBody.data.status !==
            undefined &&
          parsedBody.data.status !==
            currentLead.status,

        previousStatus: currentLead.status,

        nextStatus:
          parsedBody.data.status ||
          currentLead.status,

        internalCommentChanged:
          parsedBody.data.internalComment !==
            undefined &&
          parsedBody.data.internalComment !==
            currentLead.internalComment,

        assignedToCurrentUser:
          updateData.assignedToId ===
          req.auth.user.id,
      };

      const [updatedLead] =
        await prisma.$transaction([
          prisma.lead.update({
            where: {
              id: leadId,
            },

            data: updateData,

            select: leadSelect,
          }),

          prisma.adminAuditLog.create({
            data: {
              userId: req.auth.user.id,

              action: 'LEAD_UPDATED',

              entityType: 'Lead',
              entityId: String(leadId),

              details: JSON.stringify(
                auditDetails,
              ),

              ipAddress: metadata.ipAddress,
              userAgent: metadata.userAgent,
            },
          }),
        ]);

      return res.json({
        lead: updatedLead,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// корень админки

router.get('/', (req, res) => {
  return res.redirect(
    303,
    '/admin/login',
  );
});

// вход

router.get(
  ['/login', '/login.html'],
  sendAdminPage('login.html'),
);

// главная админки

router.get(
  ['/dashboard', '/dashboard.html'],
  requireAuth.page,
  requireRole.page('OWNER'),
  sendAdminPage('dashboard.html'),
);

// заявки

router.get(
  ['/requests', '/requests.html'],
  requireAuth.page,
  requireRole.page('OWNER', 'STAFF'),
  sendAdminPage('requests.html'),
);

// работы

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

// статьи

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

// админ 404

router.use((req, res) => {
  return res.status(404).send(
    'Страница админки не найдена',
  );
});

module.exports = router;
