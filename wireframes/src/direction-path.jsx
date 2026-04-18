// DIRECTION 1 — "PATH"
// IA: one opinionated next-thing-to-do feed.
// Home = today's plan as a vertical path. Library + Progress secondary tabs.
// Nav: bottom tab bar (Path / Library / Review / Me)

function PathHome(){
  const steps = [
    {k:'WARM UP', t:'Quick review · 5 items', s:'~3 min', due:true, done:false},
    {k:'NEW WORDS', t:'4 words from the song', s:'~4 min', done:false},
    {k:'WRITE', t:'Practice letter כ', s:'~3 min', done:false, hl:true},
    {k:'PHRASE', t:'"I want a glass of water"', s:'~5 min', done:false},
    {k:'ARRIVE', t:'Play the song · 1 verse', s:'reward', done:false, dest:true},
  ];
  return (
    <Phone label="HOME · Direction 1 (Path)" sub="today as a single vertical path">
      {/* top bar */}
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3}}>DABER</div>
        <div style={{display:'flex', gap:8, fontFamily:'JetBrains Mono', fontSize:11, color:INK2}}>
          <span>🔥 14</span><span>·</span><span>APR 18</span>
        </div>
      </div>
      <div style={{padding:'6px 18px 10px'}}>
        <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>TODAY</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:26, lineHeight:1.1, color:INK, marginTop:2}}>
          Five steps to <span style={{textDecoration:'underline', textDecorationStyle:'wavy', textDecorationColor:'var(--accent)'}}>Yerushalayim Shel Zahav</span>.
        </div>
      </div>

      {/* path */}
      <div style={{padding:'4px 18px', flex:1, position:'relative', overflow:'auto'}}>
        <div style={{position:'absolute', left:34, top:16, bottom:16, width:2, background:`repeating-linear-gradient(to bottom, ${INK2} 0 5px, transparent 5px 10px)`}}/>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:'flex', gap:10, position:'relative'}}>
              <div style={{
                width:34, height:34, borderRadius:999, flexShrink:0,
                border:`1.5px solid ${s.hl?INK:(s.dest?INK:RULE)}`,
                background: s.hl? 'var(--accent-soft)' : (s.dest? INK : PAPER),
                color: s.dest? PAPER: INK,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700,
              }}>{s.dest? '♪' : i+1}</div>
              <SketchBox pad={10} style={{flex:1, background: s.hl?'var(--accent-soft)': (s.dest? INK : 'transparent'),
                color: s.dest? PAPER: INK, borderColor: s.dest? INK: INK2}}>
                <div className="mono" style={{fontSize:8.5, letterSpacing:1.5, color: s.dest? '#B8AF98': INK3}}>{s.k}</div>
                <div style={{fontFamily:'Inter', fontSize:13, fontWeight:600, marginTop:3}}>{s.t}</div>
                <div className="mono" style={{fontSize:9, color: s.dest? '#B8AF98': INK3, marginTop:3}}>{s.s}</div>
              </SketchBox>
            </div>
          ))}
        </div>
        <Annot side="right" style={{position:'absolute', right:-4, top:180}}>
          one opinionated<br/>plan; no picking
        </Annot>
      </div>

      <BottomNav active={0} items={[
        {icon:'◎', label:'Path'},
        {icon:'☰', label:'Library'},
        {icon:'↻', label:'Review'},
        {icon:'◐', label:'Me'},
      ]}/>
    </Phone>
  );
}

function PathLibrary(){
  return (
    <Phone label="LIBRARY · Direction 1" sub="grid. songs are units.">
      <div style={{padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK}}>Library</div>
        <div className="mono" style={{fontSize:11, color:INK3}}>⌕</div>
      </div>
      <div style={{padding:'0 16px 8px', display:'flex', gap:6}}>
        {['Ready','Up next','Locked','All'].map((t,i)=>(
          <Pill key={i} active={i===0}>{t}</Pill>
        ))}
      </div>
      <div style={{padding:'4px 16px', flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, overflow:'auto'}}>
        {[
          ['SONG','Yerushalayim Shel Zahav','12 phrases',true],
          ['SONG','Bashana Haba\'ah','9 phrases',true],
          ['VIDEO','Café in Tel Aviv','dialog',false],
          ['SONG','Od Yavo\' Shalom','14 phrases',false],
          ['POEM','Kinneret','short',false],
          ['CLIP','Market haggling','dialog',false],
        ].map((s,i)=>(
          <SketchBox key={i} pad={8} style={{display:'flex', flexDirection:'column', gap:6, opacity: s[3]?1:.55}}>
            <Hatch w="100%" h={72} r={6} label={s[0]}/>
            <div>
              <div style={{fontFamily:'Inter', fontSize:11, fontWeight:700, color:INK, lineHeight:1.2}}>{s[1]}</div>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:3}}>{s[2]} · {s[3]?'OPEN':'NEEDS 4 MORE'}</div>
            </div>
          </SketchBox>
        ))}
      </div>
      <BottomNav active={1} items={[
        {icon:'◎', label:'Path'},
        {icon:'☰', label:'Library'},
        {icon:'↻', label:'Review'},
        {icon:'◐', label:'Me'},
      ]}/>
    </Phone>
  );
}

function PathLessonOverview(){
  return (
    <Phone label="LESSON OVERVIEW · Direction 1" sub="the lesson as prep for a song">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:2}}>LESSON 3</div>
        <div className="mono" style={{fontSize:11, color:INK3}}>⋯</div>
      </div>
      <div style={{padding:'6px 18px'}}>
        <Hatch w="100%" h={110} r={10} label="SONG COVER · YERUSHALAYIM"/>
        <div className="mono" style={{fontSize:9, color:INK3, marginTop:10, letterSpacing:1.5}}>DESTINATION</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK, marginTop:2, lineHeight:1.2}}>Yerushalayim Shel Zahav</div>
        <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:4, lineHeight:1.4}}>
          You'll learn 12 words and 3 phrases on the way.
        </div>
      </div>
      <div style={{padding:'14px 18px', flex:1, display:'flex', flexDirection:'column', gap:8, overflow:'auto'}}>
        <SectionH kicker="WHAT YOU'LL MEET" title="Words & phrases"/>
        {[
          ['WORDS','אוויר · זָהָב · אוֹר · עִיר','4 new, 2 known'],
          ['WRITE','ז · ר · ע','3 letters · practice'],
          ['PHRASES','"City of gold" · "mountain air"','2 new'],
          ['LINE','Full chorus','after above'],
        ].map((r,i)=>(
          <SketchBox key={i} pad={10} style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:36, textAlign:'center'}}>
              <Chip>{r[0]}</Chip>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Inter', fontSize:12, color:INK, fontWeight:600}}>{r[1]}</div>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:2}}>{r[2]}</div>
            </div>
            <Caret/>
          </SketchBox>
        ))}
        <div style={{marginTop:6}}>
          <Btn primary full>Begin · 15 min</Btn>
        </div>
      </div>
      <BottomNav active={1} items={[
        {icon:'◎', label:'Path'},
        {icon:'☰', label:'Library'},
        {icon:'↻', label:'Review'},
        {icon:'◐', label:'Me'},
      ]}/>
    </Phone>
  );
}

Object.assign(window, { PathHome, PathLibrary, PathLessonOverview });
