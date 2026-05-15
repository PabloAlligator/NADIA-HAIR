document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.hero');
  const heroSpan = document.querySelector('.hero span');
  const heroTitle = document.querySelector('.hero h1');

  if (!hero || !heroSpan || !heroTitle || typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);



  gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: '+=70%',
      scrub: 1.2,
      pin: true,

    },
  })
    .to(heroSpan, {
      y: '-20vh',
      scale: 1.04,
      ease: 'none',
    })
    .to(
      heroTitle,
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        ease: 'none',
      },
      '<35%'
    );
});
