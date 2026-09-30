import { useId } from "react";

/**
 * ReachInbox brand mark.
 *
 * `variant="lockup"` renders the full artwork (squircle + Ri monogram + wordmark)
 * and is intended for large display — the wordmark is only ~6% of the artwork's
 * height, so it is illegible below roughly 200px.
 *
 * `variant="mark"` drops the wordmark, for compact placements (sidebar, mobile
 * header) where the app supplies its own text label.
 *
 * Gradient and filter ids are suffixed per instance: this logo renders more than
 * once on the login page, and duplicate SVG ids in one document make references
 * resolve unpredictably.
 */
export function Logo({ size = 40, variant = "lockup", className, title = "ReachInbox" }) {
  const uid = useId().replace(/[:]/g, "");
  const id = (name) => `${name}-${uid}`;
  const isLockup = variant === "lockup";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={id("bg-gloss")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F2228" />
          <stop offset="40%" stopColor="#0B0C0E" />
          <stop offset="100%" stopColor="#020203" />
        </linearGradient>

        <linearGradient id={id("border-glow")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#333740" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
        </linearGradient>

        <linearGradient id={id("monogram-silver")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#E1E4E8" />
          <stop offset="70%" stopColor="#9FA4AD" />
          <stop offset="100%" stopColor="#5B6069" />
        </linearGradient>

        <linearGradient id={id("facet-highlight")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
        </linearGradient>

        <linearGradient id={id("facet-shadow")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>

        <linearGradient id={id("gold-text")} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EED59B" />
          <stop offset="50%" stopColor="#C5A059" />
          <stop offset="100%" stopColor="#9A7836" />
        </linearGradient>

        <filter id={id("monogram-shadow")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000000" floodOpacity="0.8" />
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#FFFFFF" floodOpacity="0.2" />
        </filter>

        <linearGradient id={id("glass-glare")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.03" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Squircle base canvas */}
      <rect
        x="32"
        y="32"
        width="448"
        height="448"
        rx="96"
        fill={`url(#${id("bg-gloss")})`}
        filter={`url(#${id("monogram-shadow")})`}
      />
      <rect
        x="33"
        y="33"
        width="446"
        height="446"
        rx="95"
        fill="none"
        stroke={`url(#${id("border-glow")})`}
        strokeWidth="2"
      />

      {/* Glass surface highlight corner */}
      <path
        d="M 32 128 C 32 75 75 32 128 32 L 384 32 C 437 32 480 75 480 128 L 480 180 L 32 300 Z"
        fill={`url(#${id("glass-glare")})`}
      />

      {/* 3D monogram "Ri" */}
      <g filter={`url(#${id("monogram-shadow")})`} transform="translate(0, -18)">
        <path
          d="M 170 140 C 210 140, 275 145, 275 190 C 275 220, 245 235, 220 240 C 250 255, 290 285, 295 325 C 270 325, 240 310, 215 280 C 195 255, 185 248, 175 248 L 175 315 C 175 325, 140 325, 140 315 L 140 165 C 140 148, 152 140, 170 140 Z M 175 170 L 175 220 C 195 220, 235 218, 235 195 C 235 172, 195 170, 175 170 Z"
          fill={`url(#${id("monogram-silver")})`}
        />
        <path
          d="M 140 180 C 115 170, 95 140, 110 125 C 135 110, 185 130, 210 140 C 180 140, 155 155, 140 180 Z"
          fill={`url(#${id("monogram-silver")})`}
        />
        <path
          d="M 125 210 C 105 200, 85 180, 95 165 C 115 150, 145 165, 165 175 C 145 175, 135 190, 125 210 Z"
          fill={`url(#${id("facet-highlight")})`}
        />
        <path
          d="M 170 140 C 210 140, 275 145, 275 190 C 275 220, 245 235, 220 240 C 195 220, 175 220, 175 170 Z"
          fill={`url(#${id("facet-shadow")})`}
          opacity="0.35"
        />
        <path
          d="M 320 220 C 340 220, 355 240, 350 270 C 345 300, 325 325, 295 325 C 310 305, 320 280, 320 255 C 320 235, 312 225, 305 220 Z"
          fill={`url(#${id("monogram-silver")})`}
        />
        <circle cx="340" cy="165" r="22" fill={`url(#${id("monogram-silver")})`} />
        <circle cx="334" cy="159" r="18" fill={`url(#${id("facet-highlight")})`} opacity="0.7" />
        <path
          d="M 170 142 C 210 142, 273 147, 273 190"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          opacity="0.8"
        />
        <path
          d="M 140 165 L 140 315"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          opacity="0.6"
        />
      </g>

      {/* Wordmark — omitted in the compact variant */}
      {isLockup ? (
        <text
          x="256"
          y="420"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
          fontSize="34"
          fontWeight="600"
          letterSpacing="0.5"
          fill={`url(#${id("gold-text")})`}
        >
          Reach<tspan fontWeight="700">Inbox</tspan>
        </text>
      ) : null}
    </svg>
  );
}
