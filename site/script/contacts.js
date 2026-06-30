'use strict';

// CONTACTS PAGE INIT

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initContactHero();
});

// HEADER + BURGER

function initHeader() {
  const header = document.querySelector('[data-header]');
  const burger = document.querySelector('[data-burger]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');

  if (!header || !burger || !mobileMenu) return;

  let lastScrollY = window.scrollY;
  let isTicking = false;
  let touchStartY = 0;

  function updateHeader() {
    const currentScrollY = window.scrollY;
    const isScrolled = currentScrollY > 24;
    const isScrollingDown = currentScrollY > lastScrollY;
    const isMenuOpen = header.classList.contains('is-menu-open');

    header.classList.toggle('is-scrolled', isScrolled);

    if (currentScrollY > 140 && isScrollingDown && !isMenuOpen) {
      header.classList.add('is-hidden');
    } else {
      header.classList.remove('is-hidden');
    }

    lastScrollY = currentScrollY;
    isTicking = false;
  }

  function requestHeaderUpdate() {
    if (isTicking) return;

    window.requestAnimationFrame(updateHeader);
    isTicking = true;
  }

  function openMobileMenu() {
    header.classList.add('is-menu-open');
    document.body.classList.add('is-lock');

    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Закрыть меню');

    header.classList.remove('is-hidden');
  }

  function closeMobileMenu() {
    header.classList.remove('is-menu-open');
    document.body.classList.remove('is-lock');

    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  function toggleMobileMenu() {
    const isOpen = header.classList.contains('is-menu-open');

    if (isOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  function closeMenuAfterScrollIntent() {
    if (!header.classList.contains('is-menu-open')) return;

    closeMobileMenu();

    if (window.scrollY > 140) {
      header.classList.add('is-hidden');
    }
  }

  burger.addEventListener('click', toggleMobileMenu);

  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileMenu();
    }
  });

  window.addEventListener('scroll', requestHeaderUpdate, {
    passive: true,
  });

  window.addEventListener('wheel', closeMenuAfterScrollIntent, {
    passive: true,
  });

  document.addEventListener(
    'touchstart',
    (event) => {
      if (!header.classList.contains('is-menu-open')) return;
      if (event.target.closest('[data-burger]')) return;

      touchStartY = event.touches[0].clientY;
    },
    {
      passive: true,
    }
  );

  document.addEventListener(
    'touchmove',
    (event) => {
      if (!header.classList.contains('is-menu-open')) return;
      if (event.target.closest('[data-burger]')) return;

      const currentY = event.touches[0].clientY;
      const diff = Math.abs(currentY - touchStartY);

      if (diff > 12) {
        closeMenuAfterScrollIntent();
      }
    },
    {
      passive: true,
    }
  );

  updateHeader();
}

// CONTACT HERO SCROLL ANIMATION
function initContactHero() {
  const section = document.querySelector('.js-contact-hero');

  if (!section) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const content = section.querySelector('.contact-hero__content');
  const visual = section.querySelector('.contact-hero__visual');
  const image = section.querySelector('.contact-hero__visual img');
  const quote = section.querySelector('.contact-hero__quote');

  if (!content || !visual || !image || !quote) return;

  gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();

  mm.add('(min-width: 769px)', () => {
    gsap.set(content, {
      autoAlpha: 1,
      xPercent: 0,
      filter: 'blur(0px)',
      zIndex: 5,
    });

    gsap.set(visual, {
      width: '50%',
      xPercent: 0,
      zIndex: 2,
    });

    gsap.set(image, {
      scale: 1,
      xPercent: 0,
      yPercent: 0,
      objectPosition: '62% 22%',
      transformOrigin: '62% 28%',
    });

    gsap.set(quote, {
      autoAlpha: 0,
      y: 28,
      zIndex: 6,
    });

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=180%',
        scrub: 1.15,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    timeline
      .to(
        content,
        {
          autoAlpha: 0,
          xPercent: -12,
          filter: 'blur(8px)',
          duration: 0.34,
          ease: 'none',
        },
        0
      )
      .to(
        visual,
        {
          width: '100%',
          duration: 0.58,
          ease: 'none',
        },
        0
      )
      .to(
        image,
        {
          scale: 1.16,
          yPercent: -4,
          objectPosition: '62% 14%',
          duration: 0.82,
          ease: 'none',
        },
        0.22
      )
      .to(
        quote,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.32,
          ease: 'none',
        },
        0.58
      )
      .to(
        quote,
        {
          autoAlpha: 0,
          y: -18,
          duration: 0.2,
          ease: 'none',
        },
        0.92
      );

    if (image.complete) {
      ScrollTrigger.refresh();
    } else {
      image.addEventListener(
        'load',
        () => {
          ScrollTrigger.refresh();
        },
        {
          once: true,
        }
      );
    }

    return () => {
      timeline.kill();
    };
  });

  mm.add('(max-width: 768px)', () => {
    gsap.set([content, visual, image, quote], {
      clearProps: 'all',
    });
  });
}
