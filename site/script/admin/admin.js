'use strict';

(() => {
  const page = String(
    document.body?.dataset.adminPage || '',
  );

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

  async function initLoginPage() {
    const form = document.querySelector(
      '[data-admin-login-form]',
    );

    const emailInput = document.querySelector(
      '[data-admin-email]',
    );

    const passwordInput = document.querySelector(
      '[data-admin-password]',
    );

    const submitButton = document.querySelector(
      '[data-admin-login-submit]',
    );

    const submitText = document.querySelector(
      '[data-admin-login-submit-text]',
    );

    const loader = document.querySelector(
      '[data-admin-login-loader]',
    );

    const message = document.querySelector(
      '[data-admin-login-message]',
    );

    const passwordToggle = document.querySelector(
      '[data-password-toggle]',
    );

    const passwordToggleText = document.querySelector(
      '[data-password-toggle-text]',
    );

    if (
      !form ||
      !emailInput ||
      !passwordInput ||
      !submitButton ||
      !message
    ) {
      return;
    }

    passwordToggle?.addEventListener('click', () => {
      const passwordIsVisible =
        passwordInput.type === 'text';

      passwordInput.type = passwordIsVisible
        ? 'password'
        : 'text';

      passwordToggle.setAttribute(
        'aria-pressed',
        String(!passwordIsVisible),
      );

      passwordToggle.setAttribute(
        'aria-label',
        passwordIsVisible
          ? 'Показать пароль'
          : 'Скрыть пароль',
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

      const email = emailInput.value
        .trim()
        .toLowerCase();

      const password = passwordInput.value;

      if (!email || !password) {
        showMessage(
          message,
          'Введите электронную почту и пароль.',
        );

        return;
      }

      setLoginLoading({
        isLoading: true,
        submitButton,
        submitText,
        loader,
      });

      try {
        const { response, data } = await requestJson(
          '/admin/api/auth/login',
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json',
            },

            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

        if (!response.ok) {
          if (response.status === 429) {
            showMessage(
              message,
              'Слишком много попыток входа. Попробуйте позже.',
            );

            return;
          }

          showMessage(
            message,
            data?.message || 'Не удалось выполнить вход.',
          );

          passwordInput.value = '';
          passwordInput.focus();

          return;
        }

        showMessage(
          message,
          'Вход выполнен. Открываем панель…',
          true,
        );

        const role = data?.user?.role;

        window.location.replace(
          role === 'STAFF'
            ? '/admin/requests'
            : '/admin/dashboard',
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
      const { response, data } = await requestJson(
        '/admin/api/auth/me',
      );

      if (!response.ok || !data?.user) {
        return;
      }

      window.location.replace(
        data.user.role === 'STAFF'
          ? '/admin/requests'
          : '/admin/dashboard',
      );
    } catch {
      // Страница входа должна оставаться доступной,
      // даже если проверка текущей сессии временно не удалась.
    }
  }

  async function initProtectedAdminPage() {
    try {
      const { response, data } = await requestJson(
        '/admin/api/auth/me',
      );

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok || !data?.user) {
        throw new Error('Не удалось получить пользователя');
      }

      renderAdminUser(data.user);
      applyRoleVisibility(data.user.role);

      const csrfResult = await requestJson(
        '/admin/api/auth/csrf',
      );

      if (csrfResult.response.status === 401) {
        redirectToLogin();
        return;
      }

      if (
        !csrfResult.response.ok ||
        !csrfResult.data?.csrfToken
      ) {
        throw new Error('Не удалось получить CSRF-токен');
      }

      csrfToken = csrfResult.data.csrfToken;

      bindLogout();
    } catch (error) {
      console.error(
        'Ошибка инициализации админ-панели:',
        error,
      );

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

    document
      .querySelectorAll('[data-owner-only]')
      .forEach((element) => {
        element.remove();
      });
  }

  function bindLogout() {
    const logoutButtons = document.querySelectorAll(
      '[data-admin-logout]',
    );

    logoutButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!csrfToken) {
          redirectToLogin();
          return;
        }

        button.disabled = true;

        try {
          const { response } = await requestJson(
            '/admin/api/auth/logout',
            {
              method: 'POST',

              headers: {
                'X-CSRF-Token': csrfToken,
              },
            },
          );

          if (
            response.ok ||
            response.status === 401
          ) {
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

  function setLoginLoading({
    isLoading,
    submitButton,
    submitText,
    loader,
  }) {
    submitButton.disabled = isLoading;
    submitButton.setAttribute(
      'aria-busy',
      String(isLoading),
    );

    if (submitText) {
      submitText.textContent = isLoading
        ? 'Проверяем…'
        : 'Войти в панель';
    }

    if (loader) {
      loader.hidden = !isLoading;
    }
  }

  function showMessage(
    element,
    text,
    success = false,
  ) {
    element.textContent = text;
    element.hidden = false;

    element.classList.toggle(
      'admin-login__message--success',
      success,
    );
  }

  function hideMessage(element) {
    element.textContent = '';
    element.hidden = true;

    element.classList.remove(
      'admin-login__message--success',
    );
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

  function redirectToLogin() {
    window.location.replace('/admin/login');
  }
})();
