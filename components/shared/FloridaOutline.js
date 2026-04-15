// Florida silhouette — derived from USGS/PublicaMundi GeoJSON, projected to SVG.
// Path covers mainland FL + Keys arc. ViewBox 0 0 520 430.
// Props:
//   size: 'wordmark' | 'hero' | 'display'
//   fill: color string (default 'var(--orange)')
//   className: optional CSS class

const SIZES = {
  wordmark: { width: 20, height: 16 },
  hero:     { width: 290, height: 240 },
  display:  { width: 363, height: 300 },
};

const FL_PATH = `
  M 149,10
  L 181,10 L 190,29 L 279,33 L 362,38
  L 365,52 L 373,52 L 376,38 L 373,26
  L 380,21 L 394,27 L 412,29
  L 416,57 L 424,89 L 443,131
  L 472,175 L 468,178 L 469,199
  L 481,222 L 500,269 L 504,283 L 504,298
  L 497,352 L 491,353 L 484,370 L 486,375
  L 474,387 L 469,385 L 457,390 L 436,392
  L 430,386 L 433,376
  L 418,347 L 407,341 L 397,345
  L 389,329 L 387,316
  L 373,302 L 370,292 L 372,278
  L 365,276 L 367,284 L 360,286
  L 339,251 L 331,242
  L 351,216 L 338,217 L 329,225 L 321,213
  L 332,177 L 334,147 L 326,140 L 324,131
  L 312,129 L 297,113 L 285,106 L 284,97
  L 276,93 L 270,83
  L 245,68 L 223,72 L 224,82 L 217,80
  L 190,92 L 161,95 L 162,88 L 155,79
  L 121,60 L 97,52 L 75,50 L 57,51
  L 17,57 L 27,47 L 22,42 L 25,31
  L 10,19 L 12,10
  Z
  M 438,398
  C 418,410 390,418 362,422
  L 340,424 L 350,420 L 378,416 L 408,408 L 432,396
  Z
`;

export default function FloridaOutline({ size = 'hero', fill = 'var(--orange)', className, style }) {
  const { width, height } = SIZES[size] ?? SIZES.hero;
  return (
    <svg
      viewBox="0 0 520 430"
      width={width}
      height={height}
      fill={fill}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={FL_PATH} />
    </svg>
  );
}
