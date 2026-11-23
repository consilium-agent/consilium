// Marks the page for reveal animations before first paint, unless the reader asked for less motion.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("js");
