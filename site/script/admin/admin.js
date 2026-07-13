'use strict';

(() => {
  const page = String(document.body?.dataset.adminPage || '');

  let csrfToken = '';

  document.addEventListener('DOMContentLoaded', () => {
    if (page === 'login') {
      initLoginPage();
      return;
    }

    initProtectedAdminPage();
  });

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
    });

    let data = null;

    if (response.status !== 204) {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        data = await response.json();
      }
    }

    return {
      response,
      data,
    };
  }

  // вход

  async function initLoginPage() {
    const form = document.querySelector('[data-admin-login-form]');

    const emailInput = document.querySelector('[data-admin-email]');

    const passwordInput = document.querySelector('[data-admin-password]');

    const submitButton = document.querySelector('[data-admin-login-submit]');

    const submitText = document.querySelector('[data-admin-login-submit-text]');

    const loader = document.querySelector('[data-admin-login-loader]');

    const message = document.querySelector('[data-admin-login-message]');

    const passwordToggle = document.querySelector('[data-password-toggle]');

    const passwordToggleText = document.querySelector(
      '[data-password-toggle-text]',
    );

    if (!form || !emailInput || !passwordInput || !submitButton || !message) {
      return;
    }

    passwordToggle?.addEventListener('click', () => {
      const passwordIsVisible = passwordInput.type === 'text';

      passwordInput.type = passwordIsVisible ? 'password' : 'text';

      passwordToggle.setAttribute('aria-pressed', String(!passwordIsVisible));

      passwordToggle.setAttribute(
        'aria-label',
        passwordIsVisible ? 'Показать пароль' : 'Скрыть пароль',
      );

      if (passwordToggleText) {
        passwordToggleText.textContent = passwordIsVisible
          ? 'Показать'
          : 'Скрыть';
      }

      passwordInput.focus();
    });

    await redirectAuthenticatedUser();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      hideMessage(message);

      const email = emailInput.value.trim().toLowerCase();

      const password = passwordInput.value;

      if (!email || !password) {
        showMessage(message, 'Введите электронную почту и пароль.');

        return;
      }

      setLoginLoading({
        isLoading: true,
        submitButton,
        submitText,
        loader,
      });

      try {
        const { response, data } = await requestJson('/admin/api/auth/login', {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            email,
            password,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            showMessage(
              message,
              'Слишком много попыток входа. Попробуйте позже.',
            );

            return;
          }

          showMessage(message, data?.message || 'Не удалось выполнить вход.');

          passwordInput.value = '';
          passwordInput.focus();

          return;
        }

        showMessage(message, 'Вход выполнен. Открываем панель…', true);

        const role = data?.user?.role;

        window.location.replace(
          role === 'STAFF' ? '/admin/requests' : '/admin/dashboard',
        );
      } catch (error) {
        console.error('Ошибка входа:', error);

        showMessage(
          message,
          'Не удалось связаться с сервером. Попробуйте ещё раз.',
        );
      } finally {
        setLoginLoading({
          isLoading: false,
          submitButton,
          submitText,
          loader,
        });
      }
    });
  }

  async function redirectAuthenticatedUser() {
    try {
      const { response, data } = await requestJson('/admin/api/auth/me');

      if (!response.ok || !data?.user) {
        return;
      }

      window.location.replace(
        data.user.role === 'STAFF' ? '/admin/requests' : '/admin/dashboard',
      );
    } catch {
      // оставляем страницу входа доступной
    }
  }

  // защищенная админка

  async function initProtectedAdminPage() {
    try {
      const { response, data } = await requestJson('/admin/api/auth/me');

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok || !data?.user) {
        throw new Error('Не удалось получить пользователя');
      }

      renderAdminUser(data.user);
      applyRoleVisibility(data.user.role);

      const csrfResult = await requestJson('/admin/api/auth/csrf');

      if (csrfResult.response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!csrfResult.response.ok || !csrfResult.data?.csrfToken) {
        throw new Error('Не удалось получить CSRF-токен');
      }

      csrfToken = csrfResult.data.csrfToken;

      bindLogout();

      if (page === 'requests') {
        await initRequestsPage(data.user);
      }
    } catch (error) {
      console.error('Ошибка инициализации админ-панели:', error);

      redirectToLogin();
    }
  }

  function renderAdminUser(user) {
    setText('[data-admin-user-name]', user.name || 'пользователь');

    setText('[data-admin-user-email]', user.email || '—');

    setText('[data-admin-user-role]', formatRole(user.role));

    setText('[data-admin-role-card]', formatRole(user.role));
  }

  function applyRoleVisibility(role) {
    if (role === 'OWNER') {
      return;
    }

    document.querySelectorAll('[data-owner-only]').forEach((element) => {
      element.remove();
    });
  }

  // выход

  function bindLogout() {
    const logoutButtons = document.querySelectorAll('[data-admin-logout]');

    logoutButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!csrfToken) {
          redirectToLogin();
          return;
        }

        button.disabled = true;

        try {
          const { response } = await requestJson('/admin/api/auth/logout', {
            method: 'POST',

            headers: {
              'X-CSRF-Token': csrfToken,
            },
          });

          if (response.ok || response.status === 401) {
            window.location.replace('/admin/login');

            return;
          }

          throw new Error('Сервер отклонил выход');
        } catch (error) {
          console.error('Ошибка выхода:', error);

          button.disabled = false;
        }
      });
    });
  }

  // заявки

  async function initRequestsPage(adminUser) {
    const canDeleteLeads = adminUser?.role === 'OWNER';
    const list = document.querySelector('[data-requests-list]');

    const loading = document.querySelector('[data-requests-loading]');

    const empty = document.querySelector('[data-requests-empty]');

    const message = document.querySelector('[data-requests-message]');

    const refreshButton = document.querySelector('[data-requests-refresh]');

    const searchForm = document.querySelector('[data-requests-search-form]');

    const searchInput = document.querySelector('[data-requests-search]');

    const searchReset = document.querySelector('[data-requests-search-reset]');

    const filterButtons = document.querySelectorAll('[data-request-filter]');

    const pagination = document.querySelector('[data-requests-pagination]');

    const paginationInfo = document.querySelector(
      '[data-requests-pagination-info]',
    );

    const prevButton = document.querySelector('[data-requests-prev]');

    const nextButton = document.querySelector('[data-requests-next]');

    if (
      !list ||
      !loading ||
      !empty ||
      !message ||
      !refreshButton ||
      !searchForm ||
      !searchInput ||
      !searchReset ||
      !pagination ||
      !paginationInfo ||
      !prevButton ||
      !nextButton
    ) {
      return;
    }

    const searchSubmitButton = searchForm.querySelector(
      'button[type="submit"]',
    );

    const state = {
      status: '',
      search: '',
      page: 1,
      limit: 20,
      pages: 1,
      total: 0,
      isLoading: false,
    };

    let requestNumber = 0;

    refreshButton.addEventListener('click', async () => {
      await loadRequests();
    });

    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      state.search = searchInput.value.trim();

      state.page = 1;

      searchReset.hidden = !state.search;

      await loadRequests();
    });

    searchReset.addEventListener('click', async () => {
      searchInput.value = '';
      state.search = '';
      state.page = 1;

      searchReset.hidden = true;

      await loadRequests();
    });

    filterButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        state.status = String(button.dataset.requestFilter || '');

        state.page = 1;

        updateActiveFilter();

        await loadRequests();
      });
    });

    prevButton.addEventListener('click', async () => {
      if (state.isLoading || state.page <= 1) {
        return;
      }

      state.page -= 1;

      await loadRequests();
    });

    nextButton.addEventListener('click', async () => {
      if (state.isLoading || state.page >= state.pages) {
        return;
      }

      state.page += 1;

      await loadRequests();
    });

    await loadRequests();

    async function loadRequests(options = {}) {
      const preserveMessage = options.preserveMessage === true;

      const currentRequest = ++requestNumber;

      if (!preserveMessage) {
        hideRequestsMessage();
      }

      setRequestsLoading(true);

      const params = new URLSearchParams({
        page: String(state.page),
        limit: String(state.limit),
      });

      if (state.status) {
        params.set('status', state.status);
      }

      if (state.search) {
        params.set('search', state.search);
      }

      try {
        const { response, data } = await requestJson(
          `/admin/api/leads?${params.toString()}`,
        );

        if (currentRequest !== requestNumber) {
          return;
        }

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error(data?.message || 'Не удалось загрузить заявки');
        }

        const leads = Array.isArray(data?.leads) ? data.leads : [];

        state.page = Number(data?.pagination?.page) || 1;

        state.pages = Number(data?.pagination?.pages) || 1;

        state.total = Number(data?.pagination?.total) || 0;

        renderRequestCounts(data?.counts || {});

        renderRequests(leads);

        updatePagination();
        updateActiveFilter();

        searchReset.hidden = !state.search;
      } catch (error) {
        console.error('Ошибка загрузки заявок:', error);

        list.hidden = true;
        empty.hidden = true;
        pagination.hidden = true;

        showRequestsMessage(error.message || 'Не удалось загрузить заявки.');
      } finally {
        if (currentRequest === requestNumber) {
          setRequestsLoading(false);
        }
      }
    }

    function setRequestsLoading(isLoading) {
      state.isLoading = isLoading;

      loading.hidden = !isLoading;
      refreshButton.disabled = isLoading;

      if (searchSubmitButton) {
        searchSubmitButton.disabled = isLoading;
      }

      filterButtons.forEach((button) => {
        button.disabled = isLoading;
      });

      if (isLoading) {
        list.hidden = true;
        empty.hidden = true;
        pagination.hidden = true;
      }
    }

    function renderRequestCounts(counts) {
      const values = {
        all: counts.all || 0,
        NEW: counts.NEW || 0,
        IN_PROGRESS: counts.IN_PROGRESS || 0,
        COMPLETED: counts.COMPLETED || 0,
        CANCELLED: counts.CANCELLED || 0,
      };

      Object.entries(values).forEach(([status, value]) => {
        const element = document.querySelector(
          `[data-request-count="${status}"]`,
        );

        if (element) {
          element.textContent = String(value);
        }
      });
    }

    function renderRequests(leads) {
      if (!leads.length) {
        list.innerHTML = '';
        list.hidden = true;
        empty.hidden = false;

        return;
      }

      empty.hidden = true;

      list.innerHTML = leads.map(renderRequestCard).join('');

      list.hidden = false;

      bindRequestCards();
    }

    function renderRequestCard(lead) {
      const id = Number(lead.id);

      const status = getValidLeadStatus(lead.status);

      const statusLabel = formatLeadStatus(status);

      const name = escapeHtml(lead.name || 'Без имени');

      const phone = escapeHtml(lead.phone || '');

      const formattedPhone = escapeHtml(formatPhone(lead.phone));

      const service = escapeHtml(lead.service || 'Не указана');

      const messageText = lead.message
        ? escapeHtml(lead.message)
        : 'Комментарий не указан';

      const source = escapeHtml(formatLeadSource(lead.source));

      const createdAt = escapeHtml(formatDate(lead.createdAt));

      const updatedAt = escapeHtml(formatDate(lead.updatedAt));

      const consentText = lead.consentAccepted ? 'Получено' : 'Не получено';

      const consentDate = lead.consentAcceptedAt
        ? formatDate(lead.consentAcceptedAt)
        : '';

      const assignedName =
        lead.assignedTo?.name || lead.assignedTo?.email || 'Не назначена';

      const internalComment = escapeHtml(lead.internalComment || '');

      return `
        <article
          class="admin-request-card"
          data-lead-card="${id}"
          data-status="${status}"
        >
          <div class="admin-request-card__head">
            <div class="admin-request-card__identity">
              <span class="admin-request-card__number">
                Заявка №${id}
              </span>

              <h3 class="admin-request-card__name">
                ${name}
              </h3>

              <time class="admin-request-card__date">
                ${createdAt}
              </time>
            </div>

            <span
              class="admin-request-card__status"
              data-lead-status-badge
              >
              ${statusLabel}
              </span>
          </div>

          <div class="admin-request-card__body">
            <div class="admin-request-card__details">
              <div class="admin-request-card__info-grid">
                <div class="admin-request-card__info">
                  <span class="admin-request-card__label">
                    Телефон
                  </span>

                  <a
                    class="admin-request-card__phone"
                    href="tel:${phone}"
                  >
                    ${formattedPhone}
                  </a>
                </div>

                <div class="admin-request-card__info">
                  <span class="admin-request-card__label">
                    Услуга
                  </span>

                  <p class="admin-request-card__value">
                    ${service}
                  </p>
                </div>

                <div class="admin-request-card__info">
                  <span class="admin-request-card__label">
                    Источник
                  </span>

                  <p class="admin-request-card__value">
                    ${source}
                  </p>
                </div>

                <div class="admin-request-card__info">
                  <span class="admin-request-card__label">
                    Согласие
                  </span>

                  <p class="admin-request-card__value">
                    ${consentText}
                    ${consentDate ? ` · ${escapeHtml(consentDate)}` : ''}
                  </p>
                </div>
              </div>

              <div class="admin-request-card__message">
                <span class="admin-request-card__label">
                  Комментарий клиента
                </span>

                <p>${messageText}</p>
              </div>

              <div class="admin-request-card__meta">
                <span>
                  Создана: ${createdAt}
                </span>

                <span>
                  Обновлена: ${updatedAt}
                </span>
              </div>
            </div>

            <div class="admin-request-card__controls">
              <div class="admin-request-card__field">
                <label
                  class="admin-request-card__control-label"
                  for="lead-status-${id}"
                >
                  Статус заявки
                </label>

                <select
                  class="admin-request-card__select"
                  id="lead-status-${id}"
                  data-lead-status
                >
                  ${renderStatusOptions(status)}
                </select>
              </div>

              <div class="admin-request-card__field">
                <label
                  class="admin-request-card__control-label"
                  for="lead-comment-${id}"
                >
                  Внутренний комментарий
                </label>

                <textarea
                  class="admin-request-card__textarea"
                  id="lead-comment-${id}"
                  maxlength="2000"
                  placeholder="Например: позвонить вечером или уточнить историю окрашиваний"
                  data-lead-comment
                >${internalComment}</textarea>

                <span
                  class="admin-request-card__counter"
                  data-lead-comment-counter
                >
                  ${String(lead.internalComment || '').length} / 2000
                </span>
              </div>

              <p class="admin-request-card__assigned">
                Назначена:
                <strong data-lead-assigned>
                  ${escapeHtml(assignedName)}
                </strong>
              </p>

              <div class="admin-request-card__actions">
  <button
    class="admin-request-card__save"
    type="button"
    data-lead-save
  >
    Сохранить
  </button>

  <span
    class="admin-request-card__save-status"
    role="status"
    aria-live="polite"
    data-lead-save-status
  ></span>

  ${
    canDeleteLeads
      ? `
        <button
          class="admin-request-card__delete"
          type="button"
          aria-label="Удалить заявку №${id}"
          data-lead-delete
        >
          Удалить
        </button>
      `
      : ''
  }
</div>
            </div>
          </div>
        </article>
      `;
    }

    function renderStatusOptions(currentStatus) {
      const statuses = [
        {
          value: 'NEW',
          label: 'Новая',
        },
        {
          value: 'IN_PROGRESS',
          label: 'В работе',
        },
        {
          value: 'COMPLETED',
          label: 'Завершена',
        },
        {
          value: 'CANCELLED',
          label: 'Отменена',
        },
      ];

      return statuses
        .map((item) => {
          const selected = item.value === currentStatus ? ' selected' : '';

          return `
            <option
              value="${item.value}"
              ${selected}
            >
              ${item.label}
            </option>
          `;
        })
        .join('');
    }

    function bindRequestCards() {
      list.querySelectorAll('[data-lead-card]').forEach((card) => {
        const comment = card.querySelector('[data-lead-comment]');

        const deleteButton = card.querySelector('[data-lead-delete]');

        const counter = card.querySelector('[data-lead-comment-counter]');

        const saveButton = card.querySelector('[data-lead-save]');

        deleteButton?.addEventListener('click', async () => {
          await deleteRequestCard(card);
        });

        comment?.addEventListener('input', () => {
          if (counter) {
            counter.textContent = `${comment.value.length} / 2000`;
          }
        });

        saveButton?.addEventListener('click', async () => {
          await saveRequestCard(card);
        });
      });
    }

    async function saveRequestCard(card) {
      const leadId = Number(card.dataset.leadCard);

      const statusSelect = card.querySelector('[data-lead-status]');

      const commentInput = card.querySelector('[data-lead-comment]');

      const saveButton = card.querySelector('[data-lead-save]');

      const saveStatus = card.querySelector('[data-lead-save-status]');

      if (
        !Number.isInteger(leadId) ||
        leadId <= 0 ||
        !statusSelect ||
        !commentInput ||
        !saveButton ||
        !saveStatus
      ) {
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = 'Сохраняем…';

      saveStatus.textContent = '';
      saveStatus.classList.remove('is-error');

      try {
        const { response, data } = await requestJson(
          `/admin/api/leads/${leadId}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type': 'application/json',

              'X-CSRF-Token': csrfToken,
            },

            body: JSON.stringify({
              status: statusSelect.value,

              internalComment: commentInput.value.trim(),
            }),
          },
        );

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error(data?.message || 'Не удалось сохранить заявку');
        }

        saveStatus.textContent = 'Сохранено';

        showRequestsMessage('Заявка успешно обновлена.', true);

        await loadRequests({
          preserveMessage: true,
        });
      } catch (error) {
        console.error('Ошибка обновления заявки:', error);

        saveStatus.textContent = error.message || 'Ошибка сохранения';

        saveStatus.classList.add('is-error');
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Сохранить';
      }
    }

    async function deleteRequestCard(card) {
      const leadId = Number(card.dataset.leadCard);

      const deleteButton = card.querySelector('[data-lead-delete]');

      if (!Number.isInteger(leadId) || leadId <= 0 || !deleteButton) {
        return;
      }

      const confirmed = window.confirm(
        `Удалить заявку №${leadId}?\n\nЭто действие нельзя отменить.`,
      );

      if (!confirmed) {
        return;
      }

      const cardsOnPage = list.querySelectorAll('[data-lead-card]').length;

      deleteButton.disabled = true;
      deleteButton.textContent = 'Удаляем…';

      try {
        const { response, data } = await requestJson(
          `/admin/api/leads/${leadId}`,
          {
            method: 'DELETE',

            headers: {
              'X-CSRF-Token': csrfToken,
            },
          },
        );

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (response.status === 403) {
          throw new Error('Удалять заявки может только OWNER');
        }

        if (!response.ok) {
          throw new Error(data?.message || 'Не удалось удалить заявку');
        }

        if (cardsOnPage === 1 && state.page > 1) {
          state.page -= 1;
        }

        showRequestsMessage(`Заявка №${leadId} удалена.`, true);

        await loadRequests({
          preserveMessage: true,
        });
      } catch (error) {
        console.error('Ошибка удаления заявки:', error);

        showRequestsMessage(error.message || 'Не удалось удалить заявку.');

        deleteButton.disabled = false;
        deleteButton.textContent = 'Удалить';
      }
    }

    function updatePagination() {
      paginationInfo.textContent = `Страница ${state.page} из ${state.pages}`;

      prevButton.disabled = state.page <= 1;

      nextButton.disabled = state.page >= state.pages;

      pagination.hidden = state.pages <= 1;
    }

    function updateActiveFilter() {
      filterButtons.forEach((button) => {
        const buttonStatus = String(button.dataset.requestFilter || '');

        button.classList.toggle('is-active', buttonStatus === state.status);
      });
    }

    function showRequestsMessage(text, success = false) {
      message.textContent = text;
      message.hidden = false;

      message.classList.toggle('is-success', success);
    }

    function hideRequestsMessage() {
      message.textContent = '';
      message.hidden = true;

      message.classList.remove('is-success');
    }
  }

  // общие функции

  function setLoginLoading({ isLoading, submitButton, submitText, loader }) {
    submitButton.disabled = isLoading;

    submitButton.setAttribute('aria-busy', String(isLoading));

    if (submitText) {
      submitText.textContent = isLoading ? 'Проверяем…' : 'Войти в панель';
    }

    if (loader) {
      loader.hidden = !isLoading;
    }
  }

  function showMessage(element, text, success = false) {
    element.textContent = text;
    element.hidden = false;

    element.classList.toggle('admin-login__message--success', success);
  }

  function hideMessage(element) {
    element.textContent = '';
    element.hidden = true;

    element.classList.remove('admin-login__message--success');
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function formatRole(role) {
    if (role === 'OWNER') {
      return 'OWNER';
    }

    if (role === 'STAFF') {
      return 'STAFF';
    }

    return '—';
  }

  function getValidLeadStatus(status) {
    const statuses = new Set(['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

    return statuses.has(status) ? status : 'NEW';
  }

  function formatLeadStatus(status) {
    const statuses = {
      NEW: 'Новая',
      IN_PROGRESS: 'В работе',
      COMPLETED: 'Завершена',
      CANCELLED: 'Отменена',
    };

    return statuses[status] || 'Новая';
  }

  function formatLeadSource(source) {
    const sources = {
      'contacts-page': 'Страница контактов',
      website: 'Сайт',
    };

    return sources[source] || source || 'Сайт';
  }

  function formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('7')) {
      return (
        `+7 (${digits.slice(1, 4)}) ` +
        `${digits.slice(4, 7)}-` +
        `${digits.slice(7, 9)}-` +
        `${digits.slice(9, 11)}`
      );
    }

    return value || 'Не указан';
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Дата не указана';
    }

    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Krasnoyarsk',
    }).format(date);
  }

  function escapeHtml(value) {
    const symbols = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return String(value ?? '').replace(/[&<>"']/g, (symbol) => symbols[symbol]);
  }

  function redirectToLogin() {
    window.location.replace('/admin/login');
  }
})();
