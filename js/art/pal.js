/* PumaCraft art -- the palette: named ramps, lightest first. Every pixel the
 * painter writes comes from one of these, so the whole game shares one
 * 16-bit-era palette and the sprite sheets compress well.
 *
 * "team" is five sentinel magentas that no other ramp uses; the runtime
 * repaints them in each player's colour (js/art/sheets.js). Never use these
 * five colours anywhere else. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  PC.PAL = {
    team: ["#ff00ff", "#d400d4", "#a900a9", "#7e007e", "#530053"],
    error: ["#ff0000", "#00ff00"],
    /* the PDF: steel, gunmetal, its cyan glass */
    steel: ["#eef2fa", "#c4cce0", "#98a2c0", "#6c7698", "#465070", "#2a3048"],
    gunmetal: ["#a0a4b0", "#787c8a", "#565a68", "#3c3e4a", "#26272f", "#16161c"],
    olive: ["#c8c890", "#a0a068", "#787c4c", "#545a36", "#383c24", "#22241a"],
    rubber: ["#5a5a62", "#44444c", "#303038", "#202026", "#141418"],
    glass: ["#dffcff", "#54f2ff", "#2ab4d0", "#1a7896", "#104458"],
    amber: ["#fff0b0", "#ffd060", "#ffb000", "#c87800", "#804800"],
    red: ["#ffb0b0", "#ff5266", "#c8303e", "#88202a", "#501418"],
    /* fur and hide: the puma's tawny, the wolves' grey, the sphinxes' sand */
    tawny: ["#f8d8a0", "#e0b070", "#c48c4c", "#9a6836", "#6c4624", "#402814"],
    wolf: ["#d8d4cc", "#aca69c", "#847e74", "#5e5852", "#3e3a36", "#24221e"],
    sand: ["#fff0c8", "#f0d498", "#d8b06c", "#b4884a", "#86603a", "#563c24"],
    bone: ["#fffaf0", "#eae0cc", "#cabca0", "#a49478", "#786a54", "#4c4234"],
    violet: ["#f0d8ff", "#c8a0f0", "#9c70d8", "#7048b0", "#4a2c80", "#2a1850"],
    gold: ["#fff4c0", "#ffd870", "#e0a838", "#b07820", "#7a4c14", "#48280a"],
    /* the resources: ore is amber crystal, vapour a pale steam */
    ore: ["#fff4d0", "#ffd27a", "#f0a040", "#c86a20", "#7a3c14", "#401c0c"],
    steam: ["#f4fffa", "#c8f8e8", "#90e8d0", "#58c0a8", "#30887a"],
    fire: ["#fffbe0", "#ffe080", "#ffa030", "#e05018", "#902010", "#401008"],
    smoke: ["#a8a4a0", "#807c78", "#5c5854", "#3c3a38", "#242220"],
    /* the ground */
    dirt: ["#c8a478", "#a8845c", "#8a6a48", "#6c5038", "#50382a", "#36241c"],
    grass: ["#a8c070", "#86a056", "#688044", "#4e6234", "#384628", "#242e1c"],
    rock: ["#b0a8a0", "#8c847e", "#6c6560", "#504a46", "#383430", "#221f1d"],
    water: ["#7ab8d8", "#4a8cb8", "#2e6896", "#1e4a74", "#143254", "#0c1e38"],
    shadow: ["#000000"],
  };
})();
