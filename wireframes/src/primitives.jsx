// Wireframe primitives — sketchy mid-fi.
// Shapes: Phone, Hatch (placeholder box), Line, Btn, Pill, SketchBox,
// Annot (margin note), Chip, BottomNav, TopNav, Caret, Rule, FauxText
// ---------------------------------------------------------------

const INK = '#1E1B16';
const INK2 = '#4A4436';
const INK3 = '#8A8273';
const RULE = '#C9BFA8';
const PAPER = '#F6F2E9';
const PAPER2 = '#EEE8DA';

function Phone({ children, w = 330, h = 700, label, sub, tint }){
  return (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:14}}>
      <div style={{
        width: w, height: h, position:'relative',
        border: `1.5px solid ${INK}`, borderRadius: 34,
        background: tint || PAPER,
        boxShadow: '3px 3px 0 rgba(30,27,22,0.08)',
        overflow:'hidden',
      }}>
        {/* notch */}
        <div style={{
          position:'absolute', top:8, left:'50%', transform:'translateX(-50%)',
          width:90, height:18, borderRadius:12, border:`1.5px solid ${INK}`, background: INK,
          zIndex: 40,
        }}/>
        {/* status */}
        <div style={{
          position:'absolute', top:10, left: 22, right: 22, zIndex:30,
          display:'flex', justifyContent:'space-between',
          fontFamily:'JetBrains Mono', fontSize: 10, color: INK2,
        }}>
          <span>9:41</span>
          <span style={{letterSpacing:1}}>••• ▮</span>
        </div>
        {/* content */}
        <div style={{
          position:'absolute', inset: 0, paddingTop: 36, paddingBottom: 14,
          display:'flex', flexDirection:'column',
        }}>
          {children}
        </div>
        {/* home indicator */}
        <div style={{
          position:'absolute', bottom:6, left:'50%', transform:'translateX(-50%)',
          width: 110, height: 4, borderRadius: 4, background: INK, opacity:.45,
        }}/>
      </div>
      {(label || sub) && (
        <div style={{textAlign:'center', maxWidth: w+10}}>
          {label && <div className="mono" style={{fontSize:11, letterSpacing:2, textTransform:'uppercase', color: INK2}}>{label}</div>}
          {sub && <div className="hand" style={{fontSize:19, color: INK, lineHeight:1.15, marginTop:2}}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// Hatched placeholder box — "image/illustration here"
function Hatch({ w='100%', h=80, r=10, label, dense=false, style={} }){
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      border: `1.25px dashed ${INK3}`,
      background: `repeating-linear-gradient(135deg, transparent 0 ${dense?5:9}px, rgba(30,27,22,0.07) ${dense?5:9}px ${dense?6:10}px)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      color: INK3, fontFamily:'JetBrains Mono', fontSize: 10, textTransform:'uppercase', letterSpacing:1.5,
      ...style,
    }}>{label}</div>
  );
}

function Rule({ w='100%', style={} }){
  return <div style={{width:w, height:0, borderTop:`1px solid ${RULE}`, ...style}}/>;
}

function Btn({ children, primary, full, small, style={} }){
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
      padding: small? '8px 12px':'12px 18px',
      borderRadius: 999,
      border: `1.25px solid ${primary?INK:INK2}`,
      background: primary? INK : 'transparent',
      color: primary? PAPER : INK,
      fontFamily:'Inter', fontSize: small? 12: 13, fontWeight:600,
      width: full? '100%':'auto',
      boxShadow: primary? '2px 2px 0 rgba(30,27,22,0.15)':'none',
      ...style,
    }}>{children}</div>
  );
}

function Pill({ children, active, style={} }){
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'5px 10px', borderRadius: 999,
      border:`1px solid ${active?INK:RULE}`,
      background: active? 'var(--accent-soft)':'transparent',
      color: INK, fontFamily:'Inter', fontSize: 11, fontWeight:500,
      ...style,
    }}>{children}</span>
  );
}

function Chip({ children, style={} }){
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'3px 7px', borderRadius: 4,
      border:`1px solid ${RULE}`, background: PAPER2,
      color: INK2, fontFamily:'JetBrains Mono', fontSize: 9,
      letterSpacing: 1, textTransform:'uppercase',
      ...style,
    }}>{children}</span>
  );
}

function SketchBox({ children, style={}, r=14, pad=12, noBorder, bg }){
  return (
    <div style={{
      border: noBorder? 'none': `1.25px solid ${INK2}`,
      borderRadius: r, padding: pad,
      background: bg || 'transparent',
      ...style,
    }}>{children}</div>
  );
}

// Handwritten margin note with an arrow
function Annot({ children, side='left', style={}, arrow=true }){
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:6,
      flexDirection: side==='left'? 'row':'row-reverse',
      ...style,
    }}>
      {arrow && (
        <svg width="28" height="26" viewBox="0 0 28 26" style={{flexShrink:0, transform: side==='left'?'':'scaleX(-1)'}}>
          <path d="M2 22 C 8 18, 14 14, 22 8 M22 8 l -6 -1 M22 8 l -1 6"
            fill="none" stroke={INK2} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      <div className="hand" style={{fontSize:16, color:INK2, lineHeight:1.15, maxWidth: 180}}>{children}</div>
    </div>
  );
}

function FauxText({ lines=3, widths, style={} }){
  const w = widths || Array.from({length:lines}, (_,i)=> i===lines-1? 60: [100,90,95][i%3]);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:5, ...style}}>
      {w.map((pw,i)=>(
        <div key={i} style={{height:6, borderRadius:3, background:'rgba(30,27,22,0.15)', width: pw+'%'}}/>
      ))}
    </div>
  );
}

function Caret({ dir='right', size=10, c=INK2 }){
  const r = {right:0, down:90, left:180, up:270}[dir];
  return <span style={{display:'inline-block', transform:`rotate(${r}deg)`, color:c, fontSize:size}}>▸</span>;
}

// Tab bar (mobile bottom)
function BottomNav({ items, active=0, style={} }){
  return (
    <div style={{
      display:'flex', justifyContent:'space-around', alignItems:'center',
      borderTop:`1px solid ${RULE}`, padding:'10px 10px 6px', background: PAPER,
      ...style,
    }}>
      {items.map((it,i)=>(
        <div key={i} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:3,
          color: i===active? INK : INK3, fontFamily:'Inter', fontSize: 9.5, fontWeight: i===active? 700:500}}>
          <div style={{
            width:22, height:22, borderRadius:6,
            border:`1.25px solid ${i===active? INK: INK3}`,
            background: i===active? 'var(--accent-soft)':'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 11,
          }}>{it.icon || '□'}</div>
          <div style={{textTransform:'uppercase', letterSpacing:1}}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function TopTabs({ items, active=0, style={} }){
  return (
    <div style={{display:'flex', borderBottom:`1px solid ${RULE}`, ...style}}>
      {items.map((it,i)=>(
        <div key={i} style={{
          flex:1, textAlign:'center', padding:'10px 0',
          fontFamily:'Inter', fontSize:11, fontWeight: i===active? 700:500,
          color: i===active? INK : INK3,
          borderBottom: i===active? `2px solid ${INK}`:'2px solid transparent',
          textTransform:'uppercase', letterSpacing:1.5,
        }}>{it}</div>
      ))}
    </div>
  );
}

// Section header inside phone
function SectionH({ kicker, title, right, style={} }){
  return (
    <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', ...style}}>
      <div>
        {kicker && <div className="mono" style={{fontSize:9, letterSpacing:1.5, textTransform:'uppercase', color:INK3}}>{kicker}</div>}
        {title && <div style={{fontFamily:'Inter', fontSize:17, fontWeight:700, color:INK, marginTop:2}}>{title}</div>}
      </div>
      {right}
    </div>
  );
}

// Frame group (column of phones)
function Row({ children, gap=42, style={} }){
  return <div style={{display:'flex', gap, alignItems:'flex-start', flexWrap:'wrap', ...style}}>{children}</div>;
}

// Section container
function Section({ id, n, title, kicker, children, intro }){
  return (
    <section id={id} style={{padding:'80px 48px', borderTop:`1px solid ${RULE}`}}>
      <div style={{maxWidth:1400, margin:'0 auto'}}>
        <div style={{display:'flex', gap:20, alignItems:'flex-start', marginBottom:28, flexWrap:'wrap'}}>
          <div className="mono" style={{
            fontSize:12, letterSpacing:2, color:INK3, textTransform:'uppercase',
            border:`1px solid ${RULE}`, padding:'6px 10px', borderRadius:6, background:PAPER2,
          }}>{n}</div>
          <div style={{flex:1, minWidth:300}}>
            {kicker && <div className="mono" style={{fontSize:11, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>{kicker}</div>}
            <h2 style={{fontFamily:'Frank Ruhl Libre', fontSize: 42, margin:'4px 0 0', lineHeight:1.05, color:INK, fontWeight:500, letterSpacing:-.5}}>{title}</h2>
          </div>
          {intro && <div style={{maxWidth: 460, fontFamily:'Inter', fontSize:13, lineHeight:1.55, color:INK2}}>{intro}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

Object.assign(window, {
  INK, INK2, INK3, RULE, PAPER, PAPER2,
  Phone, Hatch, Rule, Btn, Pill, Chip, SketchBox, Annot, FauxText,
  Caret, BottomNav, TopTabs, SectionH, Row, Section,
});
