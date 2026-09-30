/* pot-motor.js · v1.0 · UMBRAL Lab 2 · motor compartido Calculadora POT + Modelo 3D
   Reglas: Ficha normativa POT (COM-030-08 con reformas; COM-48-2024 por verificar). */
(function(root){
// V14: parámetros verificados contra el reglamento POT (arts. 42-47, 47 Bis). Ver Ficha normativa POT.
const POT = {
  G1:{ie:1.2, ie_a:1.8,  ie_max:null, alt:16,  alt_a:24,  alt_max:null, perm:.70,bs:8, sepBS:3,fDCT:20,aDCT:1000,nom:'Rural'},
  G2:{ie:1.8, ie_a:2.7,  ie_max:null, alt:16,  alt_a:24,  alt_max:null, perm:.40,bs:8, sepBS:3,fDCT:8, aDCT:120, nom:'Semiurbana'},
  G3:{ie:2.7, ie_a:4.0,  ie_max:null, alt:16,  alt_a:24,  alt_max:null, perm:.10,bs:12,sepBS:3,fDCT:3, aDCT:60,  nom:'Urbana'},
  G4:{ie:4.0, ie_a:6.0,  ie_max:9.0,  alt:32,  alt_a:48,  alt_max:96,   perm:.00,bs:16,sepBS:4,fDCT:15,aDCT:450, nom:'Central'}, // Confirmado: POT COM-030-08 art. 46 (texto con reformas 2011-2013)
  G5:{ie:6.0, ie_a:9.0,  ie_max:11.0, alt:64,  alt_a:96,  alt_max:128,  perm:.00,bs:16,sepBS:5,fDCT:21,aDCT:600, nom:'Núcleo'} // ie/alt base y ampliado confirmados (art. 47). ie_max 11.0 / alt_max 128 según COM-48-2024 — PENDIENTE verificar texto oficial
};

const LAB1_VENTA = {
  z01:1771,z02:1935,z04:2601,z05:2705,z06:1394,z07:1695,z09:2040,
  z10:2778,z11:2292,z12:2055,z13:2473,z14:2533,z15:2840,z16:2079,z17:1630,z18:1055,
  z21:1191
};

const IVA_TASA = 0.12; // IVA Guatemala (SAT) — primera venta de inmueble nuevo


// Supuestos del desarrollador (prefijo 'p' = Pro, 't' = Tasador)

// Parámetros según escenario
function paramsEscenario(zonaG, esc){
  const g=POT[zonaG];
  const esMax = esc==='max' && (zonaG==='G4'||zonaG==='G5') && !!g.ie_max;
  const esMedio = esc==='max' && !esMax;
  return {g, esMax, esMedio,
    ie:  esMax?g.ie_max : esMedio?g.ie_a : g.ie,
    alt: esMax?g.alt_max: esMedio?g.alt_a: g.alt};
}

// Estacionamientos: mínimo normativo vs. diseño elegido por el usuario.
// Cada componente nunca queda por debajo de la norma.
// Visitas según Anexo I del COM-03-2009: por m² residenciales totales, no por unidad.
// (Límites intermedios 1,500/3,000/4,500 m²: verificar con el texto oficial.)
function visitasNorma(m2R){
  if(m2R<500) return 0;
  if(m2R<=1500) return 3;
  if(m2R<=3000) return 4;
  if(m2R<=4500) return 6;
  return Math.ceil(m2R/800);
}

function estacionamientos(o){
  const esZonaAlta = o.zonaG==='G3'||o.zonaG==='G4'||o.zonaG==='G5';
  // COM-03-2009 (ratios trabajados en versiones anteriores) · VERIFICAR vigencia con COM-29-2025
  const normRes = esZonaAlta ? Math.ceil(o.m2R/300) : Math.ceil(o.m2R/100);
  const normVis = visitasNorma(o.m2R);
  const am = o.am>0 ? Math.ceil(o.am/75) : 0; // COM-29-2025: 1 c/75 m² áreas sociales
  const disRes = Math.ceil(o.nu*o.plazasU);
  const disVis = (o.visitas!=null && o.visitas>=0) ? o.visitas : normVis;
  const res = Math.max(normRes, disRes);
  const vis = Math.max(normVis, disVis);
  return {normRes, normVis, am, norma:normRes+normVis+am,
          disRes, disVis, res, vis, total:res+vis+am};
}

// Sótano por plazas × m²/plaza. Nunca ocupa el área permeable mínima.
function calcSotanoV10(o){
  const permMin = o.area*o.perm;
  const areaNivelMax = o.area*(1-o.perm);
  const areaLibre = o.permiteSup ? Math.max(0, o.area - o.huella - permMin) : 0;
  const sup = Math.floor(areaLibre/o.m2Plaza);
  const avisos=[];
  if(o.ancho>0 && o.largo>0 && Math.min(o.ancho,o.largo)<15) avisos.push('angosto');

  if(o.nivDecl>0){ // sótano declarado por el usuario
    const aDecl = o.areaDecl>0 ? o.areaDecl : areaNivelMax;
    const excedePerm = aDecl > areaNivelMax + 0.5;
    const aN = Math.min(aDecl, areaNivelMax);
    const plazasSot = o.nivDecl*Math.floor(aN/o.m2Plaza);
    const plazasSup = Math.min(sup, Math.max(0,o.plazas-plazasSot));
    return {modo:'declarado', niveles:o.nivDecl, areaNivel:aN, m2Sot:aN*o.nivDecl,
            plazasSot, plazasSup, capacidad:plazasSot+sup,
            suficiente:plazasSot+sup>=o.plazas, excedePerm, avisos};
  }
  if(sup>=o.plazas){
    return {modo:'superficie', niveles:0, m2Sot:0, plazasSot:0, plazasSup:o.plazas,
            capacidad:sup, suficiente:true, excedePerm:false, avisos};
  }
  const plazasSot = o.plazas - sup;
  const porNivel = Math.floor(areaNivelMax/o.m2Plaza);
  if(porNivel<1){
    return {modo:'inviable', niveles:0, m2Sot:0, plazasSot:0, plazasSup:sup,
            capacidad:sup, suficiente:false, excedePerm:false, avisos};
  }
  const niveles = Math.ceil(plazasSot/porNivel);
  if(niveles>4) avisos.push('muchos_niveles');
  return {modo:'auto', niveles, areaNivel:areaNivelMax, porNivel,
          m2Sot:plazasSot*o.m2Plaza, plazasSot, plazasSup:sup,
          capacidad:sup+niveles*porNivel, suficiente:true, excedePerm:false, avisos};
}

// Costos completos sin terreno (incluye costos del desarrollador)
function costosProyecto(o){
  const obraSup = o.m2T*o.cm2;
  const obraSot = o.sot.m2Sot*o.cSot;
  const obra = obraSup+obraSot;
  const cDi = obra*o.di/100, cAd = obra*o.ad/100, cIns = obra*o.ins/100;
  const cImp = obra*o.dev.imp/100;
  const cUrb = o.area*18;
  const licE = Math.round(o.m2T*2.5*({G1:.8,G2:.9,G3:1,G4:1.2,G5:1.4}[o.zonaG]||1));
  const m2Inc = o.esMax ? Math.max(0, o.m2T - o.area*POT[o.zonaG].ie) : 0;
  const cCau = Math.round(m2Inc*o.cm2*0.05);
  const cCom = o.ventas*o.dev.com/100;
  const baseFin = obra+cDi+cAd+cIns+cImp+cUrb+licE+cCau;
  // Saldo promedio ~50% durante el plazo (desembolso progresivo). El terreno se asume con capital propio.
  const cFin = baseFin*(o.dev.finPct/100)*(o.dev.finTasa/100)*(o.dev.finMeses/12)*0.5;
  let ivaDeb=0, ivaCred=0, cIva=0;
  if(o.dev.iva==='si' && o.ventas>0){
    ivaDeb  = o.ventas*IVA_TASA/(1+IVA_TASA);                    // IVA incluido en el precio de venta
    ivaCred = (obra+cDi+cAd+cIns+cImp+cCom)*IVA_TASA/(1+IVA_TASA); // crédito fiscal de costos facturados
    cIva = Math.max(0, ivaDeb-ivaCred);
  }
  const total = baseFin+cCom+cFin+cIva;
  return {obraSup, obraSot, obra, cDi, cAd, cIns, cImp, cUrb, licE, cCau, m2Inc,
          cCom, cFin, ivaDeb, ivaCred, cIva, total};
}

// Programa automático: respeta IE del escenario Y la altura
function programaAuto(zonaG, area, tipoU, esc, altPT, ci){
  const p = paramsEscenario(zonaG, esc);
  const nMax = Math.max(1, Math.floor(p.alt/altPT));
  const huellaMax = area*(1-p.g.perm)*0.90;
  const m2TporIE = area*p.ie;
  const m2TporAlt = huellaMax*nMax;
  const limitaAltura = m2TporAlt < m2TporIE;
  const m2Tmax = Math.min(m2TporIE, m2TporAlt);
  const unidades = Math.floor(m2Tmax/(1+ci)/tipoU); // 0 = no cabe ni una unidad
  const m2R = unidades*tipoU, m2T = m2R*(1+ci);
  const niveles = Math.ceil(m2T/Math.max(huellaMax,1));
  return {p, unidades, m2R, m2T, niveles, nMax, huellaMax, limitaAltura};
}

// Proyecto completo (lo usan Pro y Tasador)
function evaluarProyecto(o){
  // o: zonaG, esc, area, ancho, largo, nu, au, ci, cm2, di, ad, ins, altPT, am,
  //    plazasU, visitas, m2Plaza, cSot, nivDecl, areaDecl, pv, dev
  const P = paramsEscenario(o.zonaG, o.esc);
  const g = P.g;
  const m2R = o.nu*o.au;
  const m2T = m2R*(1+o.ci/100);
  const m2E = o.area*P.ie;
  const nMax = Math.max(1, Math.floor(P.alt/o.altPT));
  const huellaMax = o.area*(1-g.perm);
  const huella = m2T/nMax;
  const est = estacionamientos({zonaG:o.zonaG, nu:o.nu, m2R, am:o.am, plazasU:o.plazasU, visitas:o.visitas});
  const sot = calcSotanoV10({area:o.area, perm:g.perm, huella:huellaMax*0.9, // V15: misma huella del edificio que el modelo 3D (90% de lo construible)
    plazas:est.total, m2Plaza:o.m2Plaza, ancho:o.ancho, largo:o.largo,
    nivDecl:o.nivDecl||0, areaDecl:o.areaDecl||0,
    permiteSup: o.zonaG==='G1'||o.zonaG==='G2'||o.zonaG==='G3'});
  const ventas = o.pv ? m2R*o.pv : 0;
  const C = costosProyecto({zonaG:o.zonaG, area:o.area, m2T, cm2:o.cm2, di:o.di, ad:o.ad, ins:o.ins,
    sot, cSot:o.cSot, esMax:P.esMax, dev:o.dev, ventas});
  return {P, g, m2R, m2T, m2E, nMax, huella, huellaMax, est, sot, ventas, C,
          cumIE: m2T <= m2E+0.5,
          cumAlt: huella <= huellaMax+0.5,
          nivNec: Math.ceil(m2T/Math.max(huellaMax,1))};
}

// Valor residual: el desarrollador exige margen sobre INVERSIÓN TOTAL (terreno + costos)
// Ventas = (Terreno + Costos) × (1 + m)  →  Terreno = Ventas/(1+m) − Costos
function valorResidual(ventas, costosSinTerreno, margenPct){
  return Math.max(0, ventas/(1+margenPct/100) - costosSinTerreno);
}
// ==================== GEOMETRÍA (requiere ClipperLib) ====================
// Coordenadas en metros locales. Clipper trabaja con enteros: escala 100 = centímetros.
const ESC_CL = 100;
function _CL(){ return (typeof ClipperLib!=='undefined') ? ClipperLib : require('clipper-lib'); }
function aClipper(paths){ return paths.map(r=>r.map(([x,y])=>({X:Math.round(x*ESC_CL),Y:Math.round(y*ESC_CL)}))); }
function deClipper(paths){ return paths.map(r=>r.map(p=>[p.X/ESC_CL,p.Y/ESC_CL])); }
function areaPaths(paths){ const CL=_CL(); return aClipper(paths).reduce((s,r)=>s+CL.Clipper.Area(r),0)/(ESC_CL*ESC_CL); }
// Área con signo por anillo → usamos el valor absoluto del total de anillos exteriores menos huecos
function areaAbs(paths){ return Math.abs(areaPaths(paths)); }

// Reduce una forma hacia adentro d metros (retiro uniforme desde todos los bordes)
function insetPaths(paths, d){
  if(d<=0) return paths;
  const CL=_CL(); const co=new CL.ClipperOffset(2, 0.25*ESC_CL);
  co.AddPaths(aClipper(paths), CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
  const sol=new CL.Paths(); co.Execute(sol, -d*ESC_CL);
  return deClipper(sol);
}
function interseccion(a, b){
  const CL=_CL(); const c=new CL.Clipper();
  c.AddPaths(aClipper(a), CL.PolyType.ptSubject, true); c.AddPaths(aClipper(b), CL.PolyType.ptClip, true);
  const sol=new CL.Paths(); c.Execute(CL.ClipType.ctIntersection, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return deClipper(sol);
}
// Retira la forma hacia adentro hasta que su área sea <= objetivo (búsqueda binaria del retiro)
function insetHastaArea(paths, objetivo){
  if(areaAbs(paths) <= objetivo) return {paths, d:0};
  let lo=0, hi=200;
  for(let i=0;i<40;i++){ const m=(lo+hi)/2; (areaAbs(insetPaths(paths,m))>objetivo) ? lo=m : hi=m; }
  return {paths: insetPaths(paths,hi), d:hi};
}
// Convierte un anillo lon/lat a metros locales alrededor de su centro
function lonLatAMetros(ring){
  const n=ring.length, cx=ring.reduce((s,p)=>s+p[0],0)/n, cy=ring.reduce((s,p)=>s+p[1],0)/n;
  const kx=111320*Math.cos(cy*Math.PI/180), ky=110574;
  return {ring: ring.map(([x,y])=>[(x-cx)*kx,(y-cy)*ky]), centro:[cx,cy]};
}

// ==================== VOLUMETRÍA PISO POR PISO ====================
// Escenarios: 'base' | 'ampliado' | 'maximo' (maximo solo G4/G5, valores COM-48-2024 por verificar)
function limitesEscenario(zonaG, esc){
  const g=POT[zonaG];
  if(esc==='maximo' && g.ie_max) return {ie:g.ie_max, alt:g.alt_max, porVerificar:true};
  if(esc==='ampliado' || esc==='maximo') return {ie:g.ie_a, alt:g.alt_a};
  return {ie:g.ie, alt:g.alt};
}
function categoriaNivel(g, acum, A, z1){
  if(acum <= g.ie*A + 0.5 && z1 <= g.alt + 1e-6) return 'base';
  if(acum <= g.ie_a*A + 0.5 && z1 <= g.alt_a + 1e-6) return 'ampliado';
  return 'maximo';
}
// op: {paths, zonaG, esc, hPiso=3, huellaPct=1}
function volumetria(op){
  const g=POT[op.zonaG], h=op.hPiso||3, pct=op.huellaPct==null?0.9:op.huellaPct; // Huella del edificio: 90% por defecto (el sótano siempre usa la huella máxima)
  const A=areaAbs(op.paths), lim=limitesEscenario(op.zonaG, op.esc||'base');
  // Huella del bloque inferior: la forma del predio menos el área permeable (convención: retiro uniforme)
  let inf = g.perm>0 ? insetHastaArea(op.paths, A*(1-g.perm)).paths : op.paths;
  if(pct<1) inf = insetHastaArea(inf, areaAbs(inf)*pct).paths;
  // Huella del bloque superior: retirada sepBS de TODOS los linderos (incluida la calle) y dentro de la inferior
  const sup = interseccion(insetPaths(op.paths, g.sepBS), inf);
  const aInf=areaAbs(inf), aSup=areaAbs(sup), m2Lim=lim.ie*A;
  const niveles=[]; let acum=0, motivo=null, i=0;
  while(i<200){
    i++; const z0=(i-1)*h, z1=i*h;
    if(z1 > lim.alt + 1e-6){ motivo='altura'; break; }
    const bloque = z1 <= g.bs + 1e-6 ? 'inferior' : 'superior';
    let area = bloque==='inferior' ? aInf : aSup;
    if(area < 1){ motivo='retiro'; break; }
    const resta = m2Lim - acum;
    if(resta <= 1){ motivo='indice'; break; }
    // Convención: un último nivel menor a 1/4 de planta no se construye (queda como remanente del índice)
    if(area > resta && resta < area*0.25){ motivo='indice'; break; }
    let parcial=false; if(area > resta){ area=resta; parcial=true; }
    acum += area;
    niveles.push({n:i, z0, z1, bloque, area, acum, parcial, pisosNorma: h>4?Math.ceil(h/4):1, cat:categoriaNivel(g, acum, A, z1)});
    if(parcial){ motivo='indice'; break; }
  }
  const alt = niveles.length ? niveles[niveles.length-1].z1 : 0;
  return {A, lim, aInf, aSup, inf, sup, niveles, m2:acum, alt, pctIE: acum/(g.ie*A), motivo,
          m2Base:g.ie*A, m2Amp:g.ie_a*A, m2Max:g.ie_max?g.ie_max*A:null};
}

// Programa, parqueos, sótanos y valor sobre una volumetría (mismo motor que la calculadora)
const DEV_ESTANDAR = {com:4, imp:5, finTasa:9, finMeses:24, finPct:70, iva:'si'};
function evaluarVolumetria(v, op){
  const au=op.au||80, g=POT[op.zonaG], pv=op.pv||null, m2Plaza=op.m2Plaza||30;
  const nu=Math.floor(v.m2/1.2/au), m2R=nu*au;
  const est=estacionamientos({zonaG:op.zonaG, nu, m2R, am:0, plazasU:op.plazasU||1, visitas:null});
  const sot=calcSotanoV10({area:v.A, perm:g.perm, huella:v.aInf, plazas:est.total, m2Plaza,
    ancho:0, largo:0, nivDecl:0, areaDecl:0, permiteSup: op.zonaG==='G1'||op.zonaG==='G2'||op.zonaG==='G3'});
  const ventas = pv ? m2R*pv : 0;
  const C = costosProyecto({zonaG:op.zonaG, area:v.A, m2T:m2R*1.2, // V15: costo según los apartamentos, igual que la calculadora
    cm2:op.cm2||580, di:5.5, ad:5.5, ins:13,
    sot, cSot:op.cSot||700, esMax: op.esc==='ampliado'||op.esc==='maximo', dev:op.dev||DEV_ESTANDAR, ventas}); // caución 5% sobre lo obtenido por incentivos (COM-48-2024)
  const valor = pv ? valorResidual(ventas, C.total, op.margen||25) : null;
  // Procedimiento según el nivel más exigente alcanzado
  const proc = v.niveles.some(n=>n.cat!=='base') ? 'DCT con incentivos (o Junta + vecinos)' : 'DCT, vía directa';
  return {nu, m2R, est, sot, ventas, C, valor, proc};
}

const API={POT, LAB1_VENTA, paramsEscenario, visitasNorma, estacionamientos, calcSotanoV10, costosProyecto,
  programaAuto, evaluarProyecto, valorResidual, areaAbs, insetPaths, interseccion, insetHastaArea, lonLatAMetros,
  limitesEscenario, volumetria, evaluarVolumetria};
if(typeof module!=='undefined' && module.exports) module.exports=API; else root.POTMotor=API;
})(typeof window!=='undefined'?window:globalThis);
