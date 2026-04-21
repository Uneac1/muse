import{c as s,j as r,L as i,o as a}from"./index-CJtuYmxb.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=s("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=s("EyeOff",[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=s("FilePlus",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M9 15h6",key:"cctwl0"}],["path",{d:"M12 18v-6",key:"17g6i2"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=s("RotateCcw",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]]);function u(e){return e==="critical"?"border-red-500/30 bg-red-500/10 text-red-500":e==="high"?"border-amber-500/30 bg-amber-500/10 text-amber-500":e==="medium"?"border-sky-500/30 bg-sky-500/10 text-sky-500":"border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}function m({item:e,compact:d=!1,onChanged:n}){const t=async(c,l)=>{await a.setActionState({actionId:e.id,status:c,note:l}),await n()},o=async()=>{await a.createMemory({title:e.title,content:`${e.summary}

来源：${e.source}
动作：${e.actionLabel} -> ${e.actionPath}`,kind:e.severity==="critical"||e.type==="alert"?"risk":"note",tags:[e.source,e.severity,e.entityType].filter(Boolean),source:e.source,entity_type:e.entityType,entity_key:e.entityKey,is_pinned:e.severity==="critical"?1:0,is_resolved:0}),await t("muted","已沉淀到 Memory，暂不重复提醒。")};return r.jsxs("div",{className:"rounded-[28px] border border-border bg-card p-5 shadow-sm",children:[r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"min-w-0",children:[r.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[r.jsx("div",{className:"font-medium text-foreground",children:e.title}),r.jsx("div",{className:`rounded-full border px-2.5 py-1 text-[11px] font-medium ${u(e.severity)}`,children:e.severity})]}),r.jsx("div",{className:"mt-2 text-sm leading-6 text-muted-foreground",children:e.summary}),!d&&r.jsxs("div",{className:"mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground",children:[e.source," · ",e.type," · ",e.entityType]})]}),r.jsx(i,{to:e.actionPath,className:"shrink-0 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground",children:e.actionLabel})]}),r.jsxs("div",{className:"mt-4 flex flex-wrap gap-2",children:[r.jsxs("button",{onClick:()=>t("done","已处理"),className:"inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary",children:[r.jsx(x,{className:"h-3.5 w-3.5"}),"标记完成"]}),r.jsxs("button",{onClick:()=>t("muted","已知风险，暂不重复提醒"),className:"inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary",children:[r.jsx(y,{className:"h-3.5 w-3.5"}),"已知风险"]}),r.jsxs("button",{onClick:o,className:"inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary",children:[r.jsx(p,{className:"h-3.5 w-3.5"}),"沉淀记忆"]}),e.status&&e.status!=="active"&&r.jsxs("button",{onClick:()=>t("active"),className:"inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary",children:[r.jsx(h,{className:"h-3.5 w-3.5"}),"恢复"]})]})]})}export{m as A};
