let lang = "fr";
const $ = s => document.querySelector(s);

// --- Gestion du sélecteur de langue flottant ---
const langWrapper = $("#langWrapper");
const langToggle = $(".lang-toggle");

if (langWrapper && langToggle) {
  // Ouvrir / Fermer le menu au clic sur le bouton globe
  langToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = langWrapper.classList.toggle("open");
    langToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  // Fermer le menu si l'on clique en dehors
  document.addEventListener("click", (e) => {
    if (!langWrapper.contains(e.target)) {
      langWrapper.classList.remove("open");
      langToggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Fonction de changement de langue avec transition fluide (fondu) et fermeture automatique
function setLang(l) {
  const newLang = T[l] ? l : "fr";
  if (newLang === lang) {
    // Même si c'est la même langue, on ferme le menu par sécurité au clic
    if (langWrapper) {
      langWrapper.classList.remove("open");
      langToggle.setAttribute("aria-expanded", "false");
    }
    return;
  }

  // Effet de fondu sortant sur le contenu principal
  const mainContent = document.querySelector("main");
  if (mainContent) mainContent.classList.add("lang-fade-out");

  setTimeout(() => {
    lang = newLang;
    document.documentElement.lang = lang;
    
    // Mise à jour des textes traduits
    document.querySelectorAll("[data-i18n]").forEach(el => {
      if (T[lang][el.dataset.i18n]) {
        el.textContent = T[lang][el.dataset.i18n];
      }
    });
    
    // Mise à jour des boutons actifs dans le menu
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });

    // Validation des champs du formulaire avec la nouvelle langue
    document.querySelectorAll(".field").forEach(field => validate(field, false));

    try { localStorage.setItem("lang", lang); } catch (e) {}

    // Fermeture automatique du menu dès qu'une option de langue a été choisie
    if (langWrapper) {
      langWrapper.classList.remove("open");
      langToggle.setAttribute("aria-expanded", "false");
    }

    // Effet de fondu entrant
    if (mainContent) mainContent.classList.remove("lang-fade-out");
  }, 200);
}

// Initialisation des écouteurs sur les boutons de langue du menu
document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

// Navbar rétractable
const nav = $("#navbar"), menu = $("#menu"), burger = $(".burger");
let lastY = 0;

// Gestion du scroll (masquage/affichage de la navbar)
addEventListener("scroll", () => {
  const y = scrollY;
  nav.classList.toggle("scrolled", y > 40);
  nav.classList.toggle("hide", y > lastY && y > 120 && !menu.classList.contains("open"));
  lastY = y;
}, { passive: true });

// Ouverture / Fermeture via le bouton Burger
burger.addEventListener("click", () => {
  const isOpen = menu.classList.toggle("open");
  burger.classList.toggle("open", isOpen); // Optionnel si tu animes ton burger en CSS avec une classe
  burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
});

// Fermeture automatique au clic sur un lien du menu
menu.addEventListener("click", e => {
  if (e.target.tagName === "A") {
    menu.classList.remove("open");
    burger.classList.remove("open"); // Remet le burger dans son état initial
    burger.setAttribute("aria-expanded", "false");
  }
});

// Apparition au scroll
const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// Formulaire : validation par champ (erreur / succès), puis ouverture de la messagerie
function validate(field, show = true) {
  const input = field.querySelector("input,textarea"), err = field.querySelector(".err");
  if (!field.dataset.touched && !show) return true;
  let msg = "";
  if (!input.value.trim()) msg = T[lang].e_req;
  else if (input.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value)) msg = T[lang].e_mail;
  if (!field.dataset.touched) return !msg;
  field.classList.toggle("invalid", !!msg);
  field.classList.toggle("valid", !msg);
  input.setAttribute("aria-invalid", !!msg);
  err.textContent = msg;
  return !msg;
}
const form = $("#contact-form");
form.querySelectorAll(".field").forEach(f => {
  const i = f.querySelector("input,textarea");
  i.addEventListener("blur", () => { f.dataset.touched = 1; validate(f); });
  i.addEventListener("input", () => { if (f.dataset.touched) validate(f); });
});
form.addEventListener("submit", e => {
  e.preventDefault();
  const fields = [...form.querySelectorAll(".field")];
  fields.forEach(f => (f.dataset.touched = 1));
  if (!fields.map(f => validate(f)).every(Boolean)) { form.querySelector(".invalid input,.invalid textarea")?.focus(); return; }
  $("#form-status").textContent = T[lang].ok;
  location.href = `mailto:votre@email.fr?subject=${encodeURIComponent(form.subject.value)}&body=${encodeURIComponent(form.message.value + "\n\n" + form.name.value + " (" + form.email.value + ")")}`;
});

let saved = "fr";
try { saved = localStorage.getItem("lang") || "fr"; } catch (e) {}
setLang(saved);
$("#lang").addEventListener("change", e => setLang(e.target.value));
$("#year").textContent = new Date().getFullYear();

// Gestion des onglets SISR / SLAM
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
