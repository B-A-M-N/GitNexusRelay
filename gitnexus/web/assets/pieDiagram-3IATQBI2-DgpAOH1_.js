import{t as e}from"./chunk-VELTKBKT-C9dVN39o.js";import{$t as t,A as n,En as r,It as i,Jt as a,N as o,Wn as s,en as c,fn as l,hn as u,in as d,mn as f,qn as p,sn as m,tn as h,un as g,wn as _}from"./index-Cq69WrwW.js";import"./chunk-H3VCZNTA-Bst0JWeg.js";import"./chunk-FXACKDTF-BoZSeaOZ.js";import"./chunk-XGPFEOL4-J6aDUy80.js";import{t as v}from"./chunk-AEOMTBSW-D7qjBMHW.js";import{t as y}from"./chunk-DKKBVRCY-CubAGUAy.js";import"./chunk-DU5LTGQ6-jpnuD0JV.js";import"./chunk-6NTNNK5N-BKwIckN7.js";import"./chunk-RNJOYNJ4-C0IMY4TY.js";import"./chunk-A34GCYZU-CFk5o-x4.js";import"./chunk-W7ZLLLMY-BPPG-gYy.js";import"./chunk-WSB5WSVC-Duu8g2Y7.js";import"./chunk-DJ7UZH7F-Dfg-9nTX.js";import"./chunk-TYMNRAUI-CHbQ71XP.js";var b=g.pie,x={sections:new Map,showData:!1,config:b},S=x.sections,C=x.showData,w=structuredClone(b),T={getConfig:e(()=>structuredClone(w),`getConfig`),clear:e(()=>{S=new Map,C=x.showData,l()},`clear`),setDiagramTitle:c,getDiagramTitle:m,setAccTitle:t,getAccTitle:u,setAccDescription:a,getAccDescription:d,addSection:e(({label:e,value:t})=>{if(t<0)throw Error(`"${e}" has invalid value: ${t}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);S.has(e)||(S.set(e,t),p.debug(`added new section: ${e}, with value: ${t}`))},`addSection`),getSections:e(()=>S,`getSections`),setShowData:e(e=>{C=e},`setShowData`),getShowData:e(()=>C,`getShowData`)},E=e((e,t)=>{v(e,t),t.setShowData(e.showData),e.sections.map(t.addSection)},`populateDb`),D={parse:e(async e=>{let t=await y(`pie`,e);p.debug(t),E(t,T)},`parse`)},O=e(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,`getStyles`),k=e(e=>{let t=[...e.values()].reduce((e,t)=>e+t,0),n=[...e.entries()].map(([e,t])=>({label:e,value:t})).filter(e=>e.value/t*100>=1);return _().value(e=>e.value).sort(null)(n)},`createPieArcs`),A={parser:D,db:T,renderer:{draw:e((e,t,a,c)=>{p.debug(`rendering pie chart
`+e);let l=c.db,u=f(),d=o(l.getConfig(),u.pie),m=i(t),g=m.append(`g`);g.attr(`transform`,`translate(225,225)`);let{themeVariables:_}=u,[v]=n(_.pieOuterStrokeWidth);v??=2;let y=d.textPosition,b=s().innerRadius(0).outerRadius(185),x=s().innerRadius(185*y).outerRadius(185*y);g.append(`circle`).attr(`cx`,0).attr(`cy`,0).attr(`r`,185+v/2).attr(`class`,`pieOuterCircle`);let S=l.getSections(),C=k(S),w=[_.pie1,_.pie2,_.pie3,_.pie4,_.pie5,_.pie6,_.pie7,_.pie8,_.pie9,_.pie10,_.pie11,_.pie12],T=0;S.forEach(e=>{T+=e});let E=C.filter(e=>(e.data.value/T*100).toFixed(0)!==`0`),D=r(w).domain([...S.keys()]);g.selectAll(`mySlices`).data(E).enter().append(`path`).attr(`d`,b).attr(`fill`,e=>D(e.data.label)).attr(`class`,`pieCircle`),g.selectAll(`mySlices`).data(E).enter().append(`text`).text(e=>(e.data.value/T*100).toFixed(0)+`%`).attr(`transform`,e=>`translate(`+x.centroid(e)+`)`).style(`text-anchor`,`middle`).attr(`class`,`slice`);let O=g.append(`text`).text(l.getDiagramTitle()).attr(`x`,0).attr(`y`,-400/2).attr(`class`,`pieTitleText`),A=[...S.entries()].map(([e,t])=>({label:e,value:t})),j=g.selectAll(`.legend`).data(A).enter().append(`g`).attr(`class`,`legend`).attr(`transform`,(e,t)=>{let n=22*A.length/2;return`translate(216,`+(t*22-n)+`)`});j.append(`rect`).attr(`width`,18).attr(`height`,18).style(`fill`,e=>D(e.label)).style(`stroke`,e=>D(e.label)),j.append(`text`).attr(`x`,22).attr(`y`,14).text(e=>l.getShowData()?`${e.label} [${e.value}]`:e.label);let M=512+Math.max(...j.selectAll(`text`).nodes().map(e=>e?.getBoundingClientRect().width??0)),N=O.node()?.getBoundingClientRect().width??0,P=450/2-N/2,F=450/2+N/2,I=Math.min(0,P),L=Math.max(M,F)-I;m.attr(`viewBox`,`${I} 0 ${L} 450`),h(m,450,L,d.useMaxWidth)},`draw`)},styles:O};export{A as diagram};