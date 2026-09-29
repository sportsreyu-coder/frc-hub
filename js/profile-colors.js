// Shared avatar-color palette -- used by auth-header.js (the header
// avatar's colored ring), account.js (the customization picker) and
// forum.js (coloring a poster's team badge) so all three agree on the
// same value -> hex mapping instead of duplicating it three times.
window.FRC_AVATAR_COLORS = [
  { value: "blue", hex: "#2e63c8" },
  { value: "red", hex: "#c8422e" },
  { value: "orange", hex: "#d9791f" },
  { value: "amber", hex: "#c99a1b" },
  { value: "green", hex: "#16815b" },
  { value: "teal", hex: "#1f8fa3" },
  { value: "purple", hex: "#6d4fc9" },
  { value: "pink", hex: "#c8408f" },
];

window.FRC_AVATAR_COLOR_HEX = {};
window.FRC_AVATAR_COLORS.forEach(function (c) { window.FRC_AVATAR_COLOR_HEX[c.value] = c.hex; });
