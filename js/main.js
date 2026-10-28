let lang = "fr";
const $ = s => document.querySelector(s);

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. Gestion du sélecteur de langue flottant (Bas à gauche) ---
  const langWrapper = $("#langWrapper");
  const langToggle = $(".lang-toggle");

  if (langWrapper && langToggle) {
    langToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = langWrapper.classList.toggle("open");
      langToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if (!langWrapper.contains(e.target)) {
        langWrapper.classList.remove("open");
        langToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // --- 2. Fonction de changement de langue avec transition fluide ---
  window.setLang = function(l) {
    const newLang = T[l] ? l : "fr";
    if (newLang === lang) {
      if (langWrapper) {
        langWrapper.classList.remove("open");
        langToggle.setAttribute("aria-expanded", "false");
      }
      return;
    }

    const mainContent = document.querySelector("main");
    if (mainContent) mainContent.classList.add("lang-fade-out");

    setTimeout(() => {
      lang = newLang;
      document.documentElement.lang = lang;
      
      document.querySelectorAll("[data-i18n]").forEach(el => {
        if (T[lang] && T[lang][el.dataset.i18n]) {
          el.textContent = T[lang][el.dataset.i18n];
        }
      });
      
      document.querySelectorAll(".lang-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.lang === lang);
      });

      document.querySelectorAll(".field").forEach(field => validate(field, false));

      try { localStorage.setItem("lang", lang); } catch (e) {}

      if (langWrapper) {
        langWrapper.classList.remove("open");
        langToggle.setAttribute("aria-expanded", "false");
      }

      if (mainContent) mainContent.classList.remove("lang-fade-out");
    }, 200);
  };

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  let saved = "fr";
  try { saved = localStorage.getItem("lang") || "fr"; } catch (e) {}
  setLang(saved);

  // --- 3. Gestion de la Navbar et du menu Burger (Mobile) ---
  const nav = $("#navbar"), menu = $("#menu"), burger = $(".burger");
  if (nav && menu && burger) {
    let lastY = window.scrollY;

    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      nav.classList.toggle("scrolled", y > 40);
      nav.classList.toggle("hide", y > lastY && y > 120 && !menu.classList.contains("open"));
      lastY = y;
    }, { passive: true });

    burger.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      burger.classList.toggle("open", isOpen);
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    menu.addEventListener("click", e => {
      if (e.target.tagName === "A") {
        menu.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  // --- 4. Apparition au scroll (.reveal) ---
  const isMobileDevice = window.innerWidth <= 768;
  if (isMobileDevice) {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    }), { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach(el => io.observe(el));
  }

  // --- 5. Validation et Formulaire de contact ---
  function validate(field, show = true) {
    const input = field.querySelector("input,textarea"), err = field.querySelector(".err");
    if (!input) return true;
    if (!field.dataset.touched && !show) return true;
    let msg = "";
    if (!input.value.trim()) msg = T[lang]?.e_req || "Ce champ est obligatoire.";
    else if (input.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value)) msg = T[lang]?.e_mail || "Email invalide.";
    if (!field.dataset.touched) return !msg;
    field.classList.toggle("invalid", !!msg);
    field.classList.toggle("valid", !msg);
    input.setAttribute("aria-invalid", !!msg);
    if (err) err.textContent = msg;
    return !msg;
  }

  const form = $("#contact-form");
  if (form) {
    form.querySelectorAll(".field").forEach(f => {
      const i = f.querySelector("input,textarea");
      if (i) {
        i.addEventListener("blur", () => { f.dataset.touched = 1; validate(f); });
        i.addEventListener("input", () => { if (f.dataset.touched) validate(f); });
      }
    });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const fields = [...form.querySelectorAll(".field")];
      fields.forEach(f => (f.dataset.touched = 1));
      if (!fields.map(f => validate(f)).every(Boolean)) {
        form.querySelector(".invalid input,.invalid textarea")?.focus();
        return;
      }
      const statusEl = $("#form-status");
      if (statusEl) statusEl.textContent = T[lang]?.ok || "Message prêt à l'envoi.";
      location.href = `mailto:smeyytp119@hotmail.com?subject=${encodeURIComponent(form.subject.value)}&body=${encodeURIComponent(form.message.value + "\n\n" + form.name.value + " (" + form.email.value + ")")}`;
    });
  }

  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- 6. Gestion des onglets SISR / SLAM ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const optionDescription = document.getElementById('option-description');

  if (tabButtons.length > 0 && optionDescription) {
    const descriptions = {
      slam: `<p data-i18n="desc_slam"><strong>SLAM :</strong> Solutions Logicielles et Applications Métier. Conception, développement, tests et maintenance de logiciels (web, mobile, bureau).</p>`,
      sisr: `<p data-i18n="desc_sisr"><strong>SISR :</strong> Solutions d'Infrastructure, Systèmes et Réseaux. Installation, administration, sécurisation des équipements et des réseaux informatiques.</p>`
    };

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const option = button.getAttribute('data-option');
        if (descriptions[option]) {
          optionDescription.innerHTML = descriptions[option];
        }
      });
    });
  }
});