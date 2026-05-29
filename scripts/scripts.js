// Close mobile menu when a nav link is clicked
document.querySelectorAll('.opcion__enlace').forEach(link => {
    link.addEventListener('click', () => {
        const checkbox = document.getElementById('menu-bar');
        if (checkbox) checkbox.checked = false;
    });
});

// Highlight active nav link based on scroll position
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.opcion__enlace[href^="#"]');

const activateLink = () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (window.scrollY >= sectionTop) current = section.getAttribute('id');
    });
    navLinks.forEach(link => {
        link.classList.toggle('opcion__enlace--activo', link.getAttribute('href') === `#${current}`);
    });
};

window.addEventListener('scroll', activateLink, { passive: true });
activateLink();

// Scroll-reveal: add .visible class when sections enter the viewport
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.seccion, .exp__card, .habilidad__item, .timeline__item').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
});