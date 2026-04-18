// Main app — assembles all sections with tweaks support.

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "homeVariant": "atelier",
  "handwritingVariant": "C",
  "density": "airy",
  "navStyle": "tabbar"
}/*EDITMODE-END*/;

function TweaksPanel({ tweaks, setTweak, visible }){
  if (!visible) return null;
  const Row = ({ label, options, k }) => (
    <div style={{marginBottom:10}}>
      <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5, marginBottom:4, textTransform:'uppercase'}}>{label}</div>
      <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
        {options.map(o=>(
          <div key={o.v} onClick={()=>setTweak(k, o.v)}
            style={{
              padding:'5px 9px', borderRadius:4, cursor:'pointer',
              border:`1px solid ${tweaks[k]===o.v?INK:RULE}`,
              background: tweaks[k]===o.v? INK : PAPER,
              color: tweaks[k]===o.v? PAPER: INK,
              fontFamily:'Inter', fontSize:10, fontWeight:600,
            }}>{o.l}</div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{
      position:'fixed', bottom: 20, right: 20, zIndex: 99,
      width: 260, background: PAPER, border:`1.5px solid ${INK}`, borderRadius: 10,
      padding: 14, boxShadow:'4px 4px 0 rgba(30,27,22,0.15)',
      fontFamily:'Inter',
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:16, color:INK}}>Tweaks</div>
        <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>LIVE</div>
      </div>
      <Row label="Featured home" k="homeVariant" options={[{v:'path',l:'Path'},{v:'atelier',l:'Atelier'},{v:'journey',l:'Journey'}]}/>
      <Row label="Handwriting layout" k="handwritingVariant" options={[{v:'A',l:'Canvas-first'},{v:'B',l:'Split'},{v:'C',l:'Full-bleed'}]}/>
      <Row label="Density" k="density" options={[{v:'airy',l:'Airy'},{v:'compact',l:'Compact'}]}/>
      <Row label="Nav style (see IA)" k="navStyle" options={[{v:'tabbar',l:'Tab bar'},{v:'top',l:'Top'},{v:'drawer',l:'Drawer'}]}/>
    </div>
  );
}

function Cover(){
  return (
    <section style={{padding:'80px 48px 60px', minHeight:'90vh', display:'flex', flexDirection:'column', justifyContent:'center'}}>
      <div style={{maxWidth:1400, margin:'0 auto', width:'100%'}}>
        <div className="mono" style={{fontSize:12, letterSpacing:3, color:INK3, textTransform:'uppercase'}}>Wireframe direction · v1</div>
        <div style={{display:'flex', alignItems:'flex-end', gap:40, marginTop:20, flexWrap:'wrap'}}>
          <h1 style={{fontFamily:'Frank Ruhl Libre', fontSize:120, margin:0, lineHeight:0.95, color:INK, fontWeight:500, letterSpacing:-2}}>
            Daber,<br/>redesigned.
          </h1>
          <div className="heb" style={{fontSize:140, color:INK, lineHeight:0.9}}>דַּבֵּר</div>
        </div>
        <div style={{marginTop:40, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:20, maxWidth:1100}}>
          {[
            ['Premise','Phrases first. Songs as destination, never as instruction. Handwriting respected as a peer to reading.'],
            ['Approach','Three opinionated IA directions, each with the key screens and flows. Built to be mixed, not ranked.'],
            ['Shared spine','Onboarding, handwriting, phrase practice, daily review, session recap, progress, and the destination are constant across all three.'],
          ].map(([k,v],i)=>(
            <div key={i}>
              <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>{k}</div>
              <div style={{fontFamily:'Inter', fontSize:13, color:INK2, marginTop:6, lineHeight:1.55}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:40, display:'flex', gap:20, flexWrap:'wrap'}}>
          {[
            ['01', 'Shared spine', '#spine'],
            ['02', 'Direction · Path', '#path'],
            ['03', 'Direction · Atelier', '#atelier'],
            ['04', 'Direction · Journey', '#journey'],
            ['05', 'Flow & IA map', '#flow'],
          ].map(([n,t,h])=>(
            <a key={n} href={h} style={{
              textDecoration:'none', color:INK,
              padding:'10px 14px', border:`1.25px solid ${INK2}`, borderRadius: 999,
              fontFamily:'Inter', fontSize:12, fontWeight:600,
              display:'inline-flex', alignItems:'center', gap:8,
            }}>
              <span className="mono" style={{color:INK3, fontSize:10}}>{n}</span>
              {t}
            </a>
          ))}
        </div>
        <div style={{marginTop:60, borderTop:`1px solid ${RULE}`, paddingTop:18, display:'flex', gap:30, flexWrap:'wrap'}}>
          {[
            ['Fidelity','Mid-fi sketchy wireframes'],
            ['Surface','Mobile · 390 × ~700'],
            ['Text','English labels, Hebrew RTL in content'],
            ['Gamification','Light — streak + gentle trail only'],
          ].map(([k,v],i)=>(
            <div key={i}>
              <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>{k}</div>
              <div style={{fontFamily:'Inter', fontSize:12, color:INK, marginTop:3, fontWeight:600}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Principles(){
  const p = [
    ['Phrases, not flashcards','The atomic unit of progress is a phrase or short sentence. Words exist only in service of a phrase the learner will actually use.'],
    ['Songs are destinations','Every lesson points at a song, clip, or line. The learner arrives; they do not "start" there.'],
    ['Handwriting is a peer','The writing canvas is never buried in a settings menu. It sits beside reading and listening, not below them.'],
    ['Curated exposure','Words and phrases are drip-fed in context. No "200 new words" screens, ever.'],
    ['Calm, not loud','No confetti, no XP numbers shouting from the corners. A quiet streak, a gentle trail, a recap.'],
    ['Room for the future','A single "Notebook" layer holds notes, author content, and (later) teacher-like voice flows — without disturbing the core.'],
  ];
  return (
    <Section n="00" kicker="First principles" title="What the redesign stands on"
      intro="Before the screens, the rules. Everything below is scored against these six.">
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:18}}>
        {p.map(([t,s],i)=>(
          <div key={i} style={{borderTop:`1px solid ${INK}`, paddingTop:14}}>
            <div className="mono" style={{fontSize:10, letterSpacing:1.5, color:INK3}}>P{String(i+1).padStart(2,'0')}</div>
            <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK, lineHeight:1.15, marginTop:4}}>{t}</div>
            <div style={{fontFamily:'Inter', fontSize:12.5, color:INK2, marginTop:8, lineHeight:1.55}}>{s}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Spine({ tweaks }){
  const Hand = tweaks.handwritingVariant === 'B' ? HandB : tweaks.handwritingVariant === 'C' ? HandC : HandA;
  return (
    <Section n="01" id="spine" kicker="The shared spine" title="Screens every direction has"
      intro="Onboarding, handwriting, phrase practice, review, recap, progress, and the destination. These are constant. The directions in §02–§04 differ only in IA and home.">
      <div style={{display:'flex', flexDirection:'column', gap:48}}>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, marginBottom:12}}>A · ONBOARDING (3 SCREENS)</div>
          <Row><Onb1/><Onb2/><Onb3/></Row>
        </div>
        <div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
            <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3}}>B · HANDWRITING · VARIANT {tweaks.handwritingVariant}</div>
            <div className="hand" style={{fontSize:15, color:INK3}}>toggle variants via Tweaks ↘</div>
          </div>
          <Row>
            <Hand/>
            <div style={{maxWidth:320, paddingTop:30}}>
              <div style={{fontFamily:'Frank Ruhl Libre', fontSize:24, color:INK, lineHeight:1.15}}>Freeform recognition, scored gently.</div>
              <div style={{fontFamily:'Inter', fontSize:13, color:INK2, marginTop:10, lineHeight:1.55}}>
                The learner writes the whole word in one take. The system grades <b>shape</b>, <b>proportion</b>, and <b>stroke order</b>. No "you failed" modal — three subtle chips, a retry, a next.
              </div>
              <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:8}}>
                {[
                  ['A','Canvas-first — the word floats above a large, quiet sheet.'],
                  ['B','Split — reference tile, canvas, inline score.'],
                  ['C','Full-bleed — the canvas is the whole screen; controls float.'],
                ].map(([k,t],i)=>(
                  <div key={i} style={{display:'flex', gap:10}}>
                    <div className="mono" style={{fontSize:10, color:INK, width:18, fontWeight:700}}>{k}</div>
                    <div style={{fontFamily:'Inter', fontSize:12, color:INK2, lineHeight:1.5}}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          </Row>
        </div>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, marginBottom:12}}>C · PHRASE / SENTENCE PRACTICE · D · REVIEW · E · RECAP</div>
          <Row><PhrasePractice/><ReviewQueue/><Recap/></Row>
        </div>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, marginBottom:12}}>F · PROGRESS · G · DESTINATION</div>
          <Row><Progress/><Destination/></Row>
        </div>
      </div>
    </Section>
  );
}

function DirectionPath(){
  return (
    <Section n="02" id="path" kicker="Direction · Path" title="Today is one opinionated plan."
      intro="Home is a single vertical path: warm-up → new words → write → phrase → arrive. No picking, no catalog browsing. The song at the bottom of the path is the reason you're climbing. Library and Progress are secondary.">
      <div style={{display:'flex', gap:30, alignItems:'flex-start', flexWrap:'wrap', marginBottom:30}}>
        <SketchBox pad={16} style={{maxWidth:520, background:PAPER2}}>
          <div className="mono" style={{fontSize:10, letterSpacing:1.5, color:INK3}}>IA · 4 TABS</div>
          <div className="mono" style={{fontSize:13, color:INK, marginTop:8, lineHeight:1.7}}>
            [ ◎ PATH ] → [ ☰ LIBRARY ] → [ ↻ REVIEW ] → [ ◐ ME ]
          </div>
          <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:10, lineHeight:1.5}}>
            <b>Strength:</b> lowest cognitive load. The app makes every choice except "begin".<br/>
            <b>Risk:</b> learner can feel railroaded; discovery of songs is a secondary act.
          </div>
        </SketchBox>
        <Annot side="left">daily streak feels earned · no dashboard fatigue</Annot>
      </div>
      <Row><PathHome/><PathLibrary/><PathLessonOverview/></Row>
    </Section>
  );
}

function DirectionAtelier({ navStyle='tabbar' }){
  return (
    <Section n="03" id="atelier" kicker="Direction · Atelier" title="A workbench of two peers."
      intro="Practice (words + writing + phrases) and Songs are equal. Home is a quiet workbench that offers a 'continue' card and two side-by-side tiles. The learner shapes their own session — but each subsystem is still curated.">
      <div style={{display:'flex', gap:30, alignItems:'flex-start', flexWrap:'wrap', marginBottom:30}}>
        <SketchBox pad={16} style={{maxWidth:520, background:PAPER2}}>
          <div className="mono" style={{fontSize:10, letterSpacing:1.5, color:INK3}}>IA · NAV STYLE · {navStyle.toUpperCase()}</div>
          <div className="mono" style={{fontSize:13, color:INK, marginTop:8, lineHeight:1.7}}>
            [ ◐ HOME ] · [ ✎ WRITE ] · [ ♪ SONGS ] · [ ◑ ME ]
          </div>
          <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:10, lineHeight:1.5}}>
            <b>Strength:</b> room for different sessions on different days. Writing earns its own tab.<br/>
            <b>Risk:</b> without a strong "continue" card, choice-paralysis on open.
          </div>
        </SketchBox>
        <Annot side="left">toggle nav style in Tweaks →<br/>tab bar · top · drawer</Annot>
      </div>
      <Row><AtelierHome navStyle={navStyle}/><AtelierLibrary/><AtelierLessonOverview/></Row>
    </Section>
  );
}

function DirectionJourney(){
  return (
    <Section n="04" id="journey" kicker="Direction · Journey" title="The song is the map."
      intro="Each song is a journey of 5–6 stations: Words → Write → Phrase → Line → Play. Home is not a dashboard, it's a list of journeys you're in the middle of. The IA collapses into one concept — a journey — with everything else tucked in a drawer.">
      <div style={{display:'flex', gap:30, alignItems:'flex-start', flexWrap:'wrap', marginBottom:30}}>
        <SketchBox pad={16} style={{maxWidth:520, background:PAPER2}}>
          <div className="mono" style={{fontSize:10, letterSpacing:1.5, color:INK3}}>IA · DRAWER</div>
          <div className="mono" style={{fontSize:13, color:INK, marginTop:8, lineHeight:1.7}}>
            ☰ → [ JOURNEYS · SONGS · WRITING · REVIEW · PHRASEBOOK · PROGRESS · NOTEBOOK ]
          </div>
          <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:10, lineHeight:1.5}}>
            <b>Strength:</b> most narratively satisfying; "I'm working on Yerushalayim" is a sentence a human says.<br/>
            <b>Risk:</b> drawer navigation is less mobile-native; needs a great persistent resume bar.
          </div>
        </SketchBox>
        <Annot side="left">"where am I in this song?"<br/>is a real question</Annot>
      </div>
      <Row><JourneyHome/><JourneyMap/><JourneyDrawer/></Row>
    </Section>
  );
}

function FlowMap(){
  // ASCII-ish IA flow map
  const box = (t, w=140, style={}) => (
    <div style={{
      padding:'10px 12px', border:`1.25px solid ${INK}`, borderRadius:8,
      width: w, textAlign:'center', background: PAPER, boxShadow:'2px 2px 0 rgba(30,27,22,0.1)',
      fontFamily:'Inter', fontSize:12, fontWeight:600, color: INK,
      ...style,
    }}>{t}</div>
  );
  const arrow = (dir='→') => <div style={{fontFamily:'JetBrains Mono', color:INK2, fontSize:16, padding:'0 4px'}}>{dir}</div>;
  return (
    <Section n="05" id="flow" kicker="End-to-end flow" title="One learner, one day, one arrival."
      intro="The canonical path. Every direction supports this; they differ only in where Home routes you on open.">
      <div style={{overflow:'auto', padding:'20px 4px'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, minWidth:1100}}>
          {box('Open app', 110)}
          {arrow()}
          {box('Home (varies by direction)', 180, {background:'var(--accent-soft)'})}
          {arrow()}
          {box('Lesson / Journey overview')}
          {arrow()}
          {box('Words · exposure')}
          {arrow()}
          {box('Handwriting · write', 140, {background:'var(--accent-soft)'})}
          {arrow()}
          {box('Phrase practice')}
          {arrow()}
          {box('Line · sentence')}
          {arrow()}
          {box('Destination · song', 150, {background:INK, color:PAPER})}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:6, minWidth:1100, marginTop:20}}>
          <div style={{width:110}}/>
          {arrow('↓')}
          <div style={{width:130}}/>
          {arrow('↙')}
          {box('Recap + tomorrow', 140)}
          {arrow('→')}
          {box('Daily review (next day)', 160)}
          {arrow('→')}
          {box('Progress updates', 140)}
        </div>
      </div>
      <div style={{marginTop:34}}>
        <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, marginBottom:14}}>IA COMPARISON</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(270px, 1fr))', gap:16}}>
          {[
            ['Path','Single vertical plan','Tab bar','Daily consumer'],
            ['Atelier','Peer workbench','Tab bar','Returning, self-directed'],
            ['Journey','Song-as-map','Drawer + resume','Narrative learners'],
          ].map(([t,s,n,a],i)=>(
            <SketchBox key={i} pad={14}>
              <div style={{fontFamily:'Frank Ruhl Libre', fontSize:20, color:INK}}>{t}</div>
              <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:10}}>
                <div style={{display:'flex', gap:10}}><span className="mono" style={{fontSize:9, color:INK3, width:70, letterSpacing:1.5}}>MODEL</span><span style={{fontFamily:'Inter', fontSize:12, color:INK}}>{s}</span></div>
                <div style={{display:'flex', gap:10}}><span className="mono" style={{fontSize:9, color:INK3, width:70, letterSpacing:1.5}}>NAV</span><span style={{fontFamily:'Inter', fontSize:12, color:INK}}>{n}</span></div>
                <div style={{display:'flex', gap:10}}><span className="mono" style={{fontSize:9, color:INK3, width:70, letterSpacing:1.5}}>BEST FOR</span><span style={{fontFamily:'Inter', fontSize:12, color:INK}}>{a}</span></div>
              </div>
            </SketchBox>
          ))}
        </div>
      </div>
    </Section>
  );
}

function NextSteps(){
  return (
    <Section n="06" kicker="What to look at next" title="Where I'd push from here"
      intro="A working list. Nothing here is blocking v1 wireframes — these are the questions to answer next.">
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:16}}>
        {[
          ['Pick a direction, not a winner','Most likely blend: Path home + Journey\'s song-as-map for the lesson view.'],
          ['Spike the writing engine','Freeform scoring quality is the make-or-break. Prototype the scorer before we visually commit to Variant A/B/C.'],
          ['Phrase taxonomy','Define what "phrase" means (2–7 words? fixed idioms?) and how they gate songs.'],
          ['Destination variety','Song is default; confirm clip/video/poem/dialog are equal citizens or sub-class.'],
          ['Notebook layer','Sketch the "authored content / teacher voice" extension — a sidebar or a tab?'],
          ['RTL everywhere','Verify lyric layouts, word-bank wrapping, and handwriting canvas direction on long sentences.'],
        ].map(([t,s],i)=>(
          <div key={i} style={{borderLeft:`2px solid ${INK}`, paddingLeft:12}}>
            <div style={{fontFamily:'Frank Ruhl Libre', fontSize:16, color:INK, lineHeight:1.2}}>{t}</div>
            <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:6, lineHeight:1.5}}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:40, paddingTop:20, borderTop:`1px solid ${RULE}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12}}>
        <div className="mono" style={{fontSize:10, color:INK3, letterSpacing:2}}>DABER · WIREFRAMES · V1 · APR 2026</div>
        <div className="hand" style={{fontSize:17, color:INK3}}>— end of deck —</div>
      </div>
    </Section>
  );
}

function App(){
  const [tweaks, setTweaks] = React.useState(TWEAKS_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);

  const setTweak = (k,v) => {
    const next = {...tweaks, [k]: v};
    setTweaks(next);
    try { window.parent.postMessage({type:'__edit_mode_set_keys', edits: {[k]: v}}, '*'); } catch(e){}
  };

  React.useEffect(()=>{
    const onMsg = (e)=>{
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch(e){}
    return ()=> window.removeEventListener('message', onMsg);
  }, []);

  // Reorder featured direction based on homeVariant tweak — put it first
  const dirs = {
    path: <DirectionPath key="p"/>,
    atelier: <DirectionAtelier key="a" navStyle={tweaks.navStyle}/>,
    journey: <DirectionJourney key="j"/>,
  };
  const order = [tweaks.homeVariant, ...['path','atelier','journey'].filter(x=>x!==tweaks.homeVariant)];

  return (
    <div data-screen-label="01 Daber Wireframes" style={{
      fontSize: tweaks.density==='compact'? 14: 16,
    }}>
      <Cover/>
      <Principles/>
      <Spine tweaks={tweaks}/>
      {order.map(k=>dirs[k])}
      <FlowMap/>
      <NextSteps/>
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksOpen}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
