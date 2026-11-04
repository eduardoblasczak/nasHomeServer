// Superfícies do autódromo que os mapas abertos não trazem: áreas de escape, pátio do paddock,
// solo exposto, gramados. As posições foram estimadas olhando a vista aérea real e ficam em
// metros locais. `at(x, y)` de cada régua converte a coordenada da captura de referência
// (1920x1080 a 3 px/m, centrada em cx, cy) para metros. Assim dá para conferir cada polígono
// abrindo a mesma referência.

const ruler = (cx, cy) => (X, Y) => [cx + (X - 960) / 3, cy - (Y - 540) / 3]

export const S = ruler(-60, -400)
export const SS = ruler(-60, -620)
export const M = ruler(-60, -60)
export const Nn = ruler(-60, 300)
export const E1 = ruler(250, -200)
export const E2 = ruler(250, 160)
export const NE = ruler(100, 480)
export const SE = ruler(250, -520)

const poly = (fn, ...pairs) => pairs.map(([X, Y]) => fn(X, Y))

// ------------------------------------------------------------------ cores

export const PAINT = {
  grass: '#76824c',
  grassBright: '#4f7c3d',
  lawn: '#677f4a',
  grassDry: '#a69c66',
  straw: '#b5a873',
  soilRed: '#a4633c',
  soilOrange: '#c27c49',
  clay: '#a0603c',
  dirt: '#a08f6e',
  plaza: '#7c7769',
  concrete: '#aaa59a',
  asphaltOld: '#5b5a52',
  asphaltDark: '#3a3b3b',
  asphaltBlack: '#3f4043',
  teal: '#2b8f83',
  tealDark: '#1d6a65',
  navy: '#262f33',
  greenPaint: '#2c8a45',
  city: '#6d6a60',
  forestFloor: '#33472a',
  slab: '#5c5a51',
  dirtPath: '#a8926c',
}

// ------------------------------------------------------------------ polígonos

/** Terreno do autódromo: dentro dele o chão é grama; fora, cidade. */
export const SITE = [
  NE(0, 480), NE(250, 300), NE(700, 250), NE(1000, 225), NE(1400, 205), NE(1900, 215),
  E2(1640, 0), E2(1600, 300), E2(1450, 800), E1(1720, 130), E1(1920, 420), E1(1620, 840), E1(1490, 900), E1(1330, 1080),
  SE(1230, 230), SE(1010, 640), SE(880, 840),
  SS(1640, 570), SS(1100, 590), SS(650, 530), SS(480, 360),
  S(430, 840), S(330, 400), S(270, 100), M(190, 1075), M(115, 800), M(95, 0), Nn(130, 1000), Nn(330, 320), Nn(280, 250),
]

/** Áreas pavimentadas, na ordem de pintura. `paved` escolhe a textura de asfalto. */
export const PAVED = [
  // pátio de eventos, a leste dos boxes
  {
    color: PAINT.plaza,
    points: [
      M(1000, 640), M(1180, 330), M(1380, 190), M(1690, 320), M(1550, 560), M(1440, 720), M(1500, 900),
      S(1480, 100), S(1350, 300), S(1280, 440), S(1370, 540), S(1470, 640), S(1560, 680), S(1530, 770), S(1180, 720),
      S(1000, 660), S(860, 620), S(820, 470), S(830, 290), S(930, 130), M(750, 1000), M(760, 900), M(1150, 760),
    ],
  },
  // placas de asfalto escuro dentro do pátio
  { color: PAINT.slab, soft: 0.5, points: poly(M, [1385, 185], [1668, 318], [1640, 390], [1480, 390], [1390, 395], [1305, 345], [1245, 290]) },
  { color: PAINT.slab, soft: 0.5, points: poly(E1, [440, 470], [580, 520], [530, 695], [400, 650], [420, 560]) },
  { color: PAINT.slab, soft: 0.5, points: poly(S, [1250, 560], [1320, 590], [1280, 640], [1215, 610]) },
  { color: PAINT.slab, soft: 0.5, points: poly(S, [1345, 570], [1440, 600], [1410, 640], [1330, 610]) },
  { color: PAINT.slab, soft: 0.5, points: poly(S, [1270, 690], [1370, 720], [1350, 750], [1250, 720]) },
  { color: PAINT.slab, soft: 0.5, points: poly(S, [960, 520], [1170, 625], [1150, 640], [950, 545]) },
  // escape escuro por fora do primeiro S e o laço externo ao sul
  {
    color: PAINT.asphaltDark,
    points: poly(SS, [830, 430], [1060, 490], [1250, 460], [1440, 420], [1650, 365], [1665, 420], [1500, 470], [1260, 520], [1060, 530], [860, 510]),
  },
  { color: PAINT.concrete, points: poly(SS, [970, 345], [1060, 300], [1060, 470], [960, 480], [900, 430]) },
  // estrada larga de serviço, por fora do Sol
  { color: PAINT.concrete, points: poly(E1, [1160, 60], [1260, 40], [1230, 240], [1110, 540], [980, 1080], [930, 1080], [1040, 620]) },
  { color: PAINT.concrete, points: poly(SE, [930, 0], [1010, 0], [900, 380], [810, 700], [730, 620], [860, 360]) },
  // pátios atrás dos boxes
  { color: PAINT.concrete, points: poly(M, [380, 870], [560, 860], [680, 1080], [400, 1080]) },
  { color: PAINT.asphaltOld, points: poly(M, [375, 710], [440, 710], [440, 790], [395, 790]) },
  // asfalto antigo no miolo norte, a parte escura da vista aérea
  {
    color: PAINT.asphaltOld,
    soft: 1.5,
    alpha: 0.8,
    points: poly(Nn, [590, 235], [740, 205], [860, 185], [1000, 185], [995, 250], [880, 240], [905, 310], [875, 350], [880, 392], [960, 375], [1045, 280], [1005, 360], [960, 395], [1005, 440], [970, 500], [940, 570], [875, 595], [860, 510], [770, 470], [745, 400], [735, 320], [690, 260]),
  },
  { color: PAINT.asphaltOld, soft: 1, alpha: 0.85, points: poly(Nn, [865, 135], [975, 122], [985, 180], [870, 182]) },
  { color: PAINT.asphaltOld, soft: 1, points: poly(Nn, [910, 830], [1020, 800], [1120, 800], [1120, 850], [1040, 870], [930, 925]) },
  // pátio de apoio norte, entre a pista e o lago
  { color: PAINT.concrete, points: poly(NE, [1040, 300], [1500, 270], [1440, 340], [1360, 470], [1280, 600], [1230, 700], [1170, 880], [1090, 900], [1130, 610], [1100, 430]) },
  // barranco de terra ao lado do Sol, tratado como pavimento só no pátio cinza acima dele
  { color: PAINT.concrete, points: poly(E2, [1110, 200], [1170, 90], [1420, 130], [1400, 200], [1320, 370], [1240, 340], [1100, 230]) },
]

/** Pintura de escape: é asfalto colorido, com a textura de marcas de pneu por cima. */
export const RUNOFF = [
  // por fora do primeiro S: área enorme, azul-escura, mais clara na borda externa
  {
    color: PAINT.navy,
    points: poly(SS, [545, 250], [600, 350], [690, 420], [790, 465], [835, 430], [905, 345], [1030, 245], [990, 190], [930, 180], [880, 230], [820, 290], [760, 320], [690, 310], [630, 270], [600, 230]),
  },
  { color: PAINT.tealDark, points: poly(SS, [540, 240], [600, 340], [700, 425], [800, 470], [790, 440], [700, 390], [620, 320], [575, 240]) },
  // saída do S, entre a pista e a saída dos boxes
  { color: PAINT.teal, points: poly(S, [960, 760], [1040, 790], [1120, 820], [1210, 860], [1180, 870], [1090, 850], [1010, 830]) },
  // Curva do Sol: faixa externa, turquesa
  {
    color: PAINT.teal,
    points: [
      SE(690, 440), SE(760, 470), SE(850, 290), SE(910, 100), SE(925, 0), E1(1000, 520), E1(1000, 470), E1(960, 520), E1(905, 730), E1(860, 860), E1(835, 1000), SE(760, 320),
    ],
  },
  // Descida do Lago: a grande área externa
  {
    color: PAINT.teal,
    points: poly(E2, [790, 240], [880, 240], [1100, 230], [1225, 345], [1180, 345], [1040, 320], [880, 300], [790, 305]),
  },
  {
    color: PAINT.navy,
    points: poly(E2, [700, 250], [800, 240], [800, 303], [700, 345], [640, 295]),
  },
  {
    color: PAINT.teal,
    points: poly(E2, [640, 295], [705, 345], [620, 400], [560, 450], [430, 560], [410, 600], [390, 570], [460, 470], [560, 360]),
  },
  // Ferradura: por fora, abaixo da pista
  { color: PAINT.teal, points: poly(M, [590, 655], [700, 660], [850, 650], [905, 620], [880, 690], [800, 740], [700, 735], [620, 700]) },
  // Junção: faixa larga
  { color: PAINT.teal, points: poly(Nn, [970, 740], [1110, 720], [1230, 640], [1350, 580], [1420, 600], [1330, 730], [1280, 770], [1100, 780], [990, 790], [965, 770]) },
  // trecho preto por fora, antes do Café
  { color: PAINT.asphaltBlack, points: poly(Nn, [1340, 570], [1500, 360], [1530, 300], [1510, 470], [1400, 600]) },
  // reta dos boxes: entre a pista e o pit lane
  { color: PAINT.teal, points: poly(M, [228, 200], [262, 400], [312, 620], [345, 730], [360, 700], [310, 440], [262, 200]) },
  { color: PAINT.teal, points: poly(S, [445, 220], [510, 460], [545, 700], [520, 720], [470, 470], [420, 230]) },
  // borda clara do primeiro trecho, na saída do Café
  { color: PAINT.concrete, points: poly(NE, [460, 460], [700, 410], [880, 420], [1000, 520], [1060, 640], [1100, 640], [1100, 560], [1000, 470], [880, 390], [700, 380], [540, 430], [470, 450]) },
]

/**
 * Marcas pintadas no asfalto das áreas de escape: texto, posição, altura das letras em metros, giro
 * na tela (rad). Ficam de pé para a câmera, que olha para oeste. Só os projetos do servidor.
 */
export const LOGOS = [
  { text: 'NASRACE', at: Nn(1432, 452), size: 15, turn: -0.62, color: '#f3f3ee' },
  { text: 'NASRACE', at: SS(770, 395), size: 10, turn: -0.5, color: '#e9e9e4', alpha: 0.85 },
  { text: 'DRAFT', at: SE(838, 225), size: 8.5, turn: -0.3, color: '#ffffff', alpha: 0.82 },
  { text: 'nas-server', at: E1(925, 780), size: 7.5, turn: -0.3, color: '#ffffff', alpha: 0.8 },
  { text: 'nasFinance', at: E2(1010, 282), size: 11, turn: 1.5, color: '#ffffff', alpha: 0.82 },
  { text: 'nas-pulse', at: E2(560, 400), size: 8, turn: 0.95, color: '#ffffff', alpha: 0.8 },
  { text: 'ebls.com.br', at: M(745, 700), size: 9, turn: 1.53, color: '#ffffff', alpha: 0.82 },
  { text: 'Vô Alberto', at: Nn(1200, 735), size: 9.5, turn: 1.15, color: '#ffffff', alpha: 0.8 },
]

/** Trilhas claras de terra e concreto no pátio: `{ color, width (m), alpha, points }`. Sem borda nítida. */
export const PATHS = [
  // o caminho de terra que atravessa o pátio
  { color: PAINT.dirtPath, width: 10, alpha: 0.6, points: poly(M, [1700, 300], [1640, 380], [1560, 470], [1430, 590], [1330, 680], [1240, 760], [1190, 800]) },
  // faixa de terra ao longo do prédio, até os boxes
  { color: PAINT.dirtPath, width: 12, alpha: 0.5, points: poly(S, [1100, 0], [1020, 40], [950, 100], [870, 200], [830, 320], [850, 440]) },
  { color: PAINT.dirtPath, width: 7, alpha: 0.4, points: poly(S, [1290, 470], [1350, 540], [1430, 575], [1510, 610]) },
  { color: PAINT.dirtPath, width: 6, alpha: 0.35, points: poly(S, [1180, 640], [1350, 670], [1510, 695]) },
  // guias retas de concreto
  { color: PAINT.concrete, width: 1.6, alpha: 0.75, points: poly(S, [870, 490], [1170, 630]) },
]

/** Gramados pintados por cima do pátio (os losangos do paddock e os canteiros junto à pista). */
export const LAWNS = [
  // losangos do pátio
  ...[
    poly(S, [1175, 0], [1260, 0], [1260, 120], [1165, 70]),
    poly(S, [1275, 0], [1320, 0], [1295, 75]),
    poly(S, [1340, 40], [1310, 145], [1285, 120]),
    poly(S, [1080, 190], [1190, 115], [1235, 180], [1100, 205]),
    poly(S, [1290, 160], [1315, 190], [1270, 265], [1255, 190]),
    poly(S, [1050, 240], [1215, 205], [1175, 295], [1120, 290]),
    poly(S, [1010, 160], [1035, 225], [985, 230], [985, 195]),
    poly(S, [925, 260], [960, 235], [995, 270], [950, 295]),
    poly(S, [1220, 240], [1245, 310], [1195, 325]),
    poly(S, [1015, 330], [1110, 365], [1055, 375], [1015, 365]),
    poly(S, [970, 335], [1015, 440], [925, 400]),
    poly(S, [1035, 390], [1140, 375], [1190, 400], [1090, 470], [1050, 455]),
    poly(S, [1110, 490], [1215, 440], [1225, 530], [1190, 525]),
    poly(M, [1090, 490], [1170, 495], [1110, 570], [1050, 510]),
    poly(M, [1090, 430], [1215, 400], [1180, 470], [1110, 470]),
    poly(M, [1215, 490], [1270, 565], [1160, 585]),
    poly(M, [1240, 410], [1300, 345], [1380, 400], [1275, 475]),
    poly(M, [1250, 490], [1355, 555], [1300, 620]),
    poly(M, [1320, 490], [1440, 465], [1375, 530]),
    poly(M, [1380, 400], [1440, 430], [1380, 450]),
    poly(M, [1050, 570], [1110, 590], [1100, 610]),
    poly(M, [1130, 620], [1215, 605], [1240, 650], [1195, 660]),
    poly(M, [1305, 660], [1355, 605], [1340, 680], [1290, 710]),
    poly(M, [1240, 720], [1285, 690], [1295, 750]),
    poly(M, [1330, 745], [1360, 780], [1355, 850], [1330, 820]),
    poly(M, [1250, 830], [1320, 795], [1320, 860], [1270, 875]),
    poly(M, [1100, 980], [1240, 870], [1160, 1010]),
    poly(M, [1170, 1040], [1225, 950], [1260, 1060]),
    poly(M, [1270, 1000], [1330, 925], [1300, 1060]),
  ].map((points) => ({ color: PAINT.lawn, points })),
  // gramado claro entre o S e a arquibancada do sul
  { color: PAINT.grassBright, points: poly(SS, [1020, 300], [1240, 310], [1500, 280], [1640, 170], [1700, 90], [1720, 150], [1600, 280], [1440, 330], [1240, 345], [1040, 335]) },
  { color: PAINT.grassBright, points: poly(SS, [965, 360], [1050, 340], [1250, 395], [1450, 390], [1650, 300], [1800, 110], [1820, 180], [1680, 340], [1450, 420], [1200, 430], [1000, 410]) },
]

/** Manchas de solo e capim seco: elipses suaves `[fn, X, Y, raioX, raioY, giro, cor, opacidade]`. */
export const PATCHES = [
  // miolo norte
  [Nn, 1160, 350, 330, 300, 0, PAINT.grassDry, 0.85],
  [Nn, 1100, 520, 240, 130, 0, PAINT.straw, 0.8],
  [Nn, 1270, 170, 180, 120, 0, PAINT.grass, 0.55],
  [Nn, 980, 250, 70, 25, 0.1, PAINT.soilRed, 0.75],
  [Nn, 1035, 320, 28, 22, 0, PAINT.soilOrange, 0.75],
  [Nn, 1070, 465, 40, 36, 0, PAINT.soilRed, 0.8],
  [Nn, 1150, 390, 55, 16, 0.5, PAINT.soilOrange, 0.5],
  [Nn, 1090, 600, 28, 20, 0, PAINT.soilOrange, 0.6],
  [Nn, 900, 580, 55, 22, -0.6, PAINT.concrete, 0.6],
  // miolo sul
  [M, 790, 430, 180, 150, 0, PAINT.soilOrange, 0.38],
  [M, 640, 440, 80, 130, 0.2, PAINT.grassDry, 0.55],
  [M, 900, 300, 150, 80, -0.5, PAINT.grassDry, 0.5],
  [M, 500, 420, 80, 150, 0, PAINT.grass, 0.55],
  [M, 1040, 170, 60, 40, 0, PAINT.grassDry, 0.5],
  [M, 620, 60, 90, 70, 0, PAINT.grass, 0.5],
  [Nn, 640, 700, 110, 110, 0, PAINT.grassDry, 0.4],
  [Nn, 560, 800, 70, 90, 0, PAINT.soilOrange, 0.28],
  [Nn, 640, 900, 90, 50, 0.4, PAINT.grass, 0.4],
  // barranco vermelho entre a mata e o Sol
  [E1, 800, 880, 70, 190, 0.25, PAINT.soilOrange, 0.95],
  [E1, 860, 560, 55, 90, 0.2, PAINT.soilOrange, 0.8],
  [E1, 800, 720, 40, 60, 0.2, PAINT.soilRed, 0.7],
  [SE, 690, 150, 75, 130, 0.45, PAINT.soilOrange, 0.95],
  [SE, 590, 240, 80, 40, -0.4, PAINT.soilOrange, 0.75],
  // triângulo de barro atrás da Descida do Lago
  [E2, 1240, 240, 95, 60, 0.6, PAINT.clay, 0.25],
  // estrada de terra ao lado da Reta Oposta
  [E1, 1160, 330, 45, 260, 0.33, PAINT.dirt, 0.6],
  [E1, 1000, 900, 40, 200, 0.28, PAINT.dirt, 0.5],
  // terreno em obras ao norte do Sol
  [E2, 1260, 1000, 130, 70, 0.2, PAINT.soilOrange, 0.7],
  [E2, 1010, 860, 60, 40, 0.3, PAINT.soilOrange, 0.6],
  // terreno a oeste das obras
  [E1, 1430, 90, 200, 45, -0.4, PAINT.soilRed, 0.45],
  // pátio do lado norte da represa
  [NE, 1800, 950, 80, 80, 0, PAINT.soilOrange, 0.75],
]

/** Triângulo de barro atrás da Descida do Lago: tem borda nítida, por isso é polígono. */
export const CLAY = [poly(E2, [1165, 150], [1370, 195], [1320, 360], [1250, 310], [1165, 205])]
