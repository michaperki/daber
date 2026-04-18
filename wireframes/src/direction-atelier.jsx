// DIRECTION 2 — "ATELIER"
// IA: Practice and Songs are peers. Home is a calm workbench.
// Nav: top segmented control between "Practice" and "Songs"; bottom is minimal (Home / Write / Review)

function AtelierNav({ style='tabbar' }){
  const items = [
    {icon:'◐', label:'Home'},
    {icon:'✎', label:'Write'},
    {icon:'♪', label:'Songs'},
    {icon:'◑', label:'Me'},
  ];
  if (style === 'top') {
    return null; // top tabs rendered inline in header area
  }
  if (style === 'drawer') {
    return (
      <div style={{padding:'6px 14px 10px'}}>
        <SketchBox pad={10} r={999} style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:22, height:14, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
            <div style={{height:1.5, background:INK}}/><div style={{height:1.5, background:INK, width:'70%'}}/><div style={{height:1.5, background:INK}}/>
          </div>
          <div style={{flex:1, fontFamily:'Inter', fontSize:11, fontWeight:600, color:INK}}>Menu</div>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>◐ HOME</div>
        </SketchBox>
      </div>
    );
  }
  return <BottomNav active={0} items={items}/>;
}

function AtelierTopTabs(){
  return (
    <div style={{padding:'6px 0 0'}}>
      <TopTabs items={['Home','Write','Songs','Me']} active={0}/>
    </div>
  );
}

function AtelierHome({ navStyle='tabbar' }){
  return (
    <Phone label={`HOME · Atelier · ${navStyle.toUpperCase()} NAV`} sub="workbench — practice + songs as peers">
      <div style={{padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3}}>◐ DABER</div>
        <div className="mono" style={{fontSize:10, color:INK3}}>APR 18 · DAY 42</div>
      </div>
      {navStyle === 'top' && <AtelierTopTabs/>}
      <div style={{padding:'4px 20px 10px'}}>
        <div className="hand" style={{fontSize:17, color:INK3}}>good evening, Ari.</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:26, color:INK, lineHeight:1.15, marginTop:2}}>
          Your bench is set.
        </div>
      </div>

      <div style={{padding:'8px 18px', flex:1, display:'flex', flexDirection:'column', gap:10, overflow:'auto'}}>
        {/* primary card: continue */}
        <SketchBox pad={14} style={{background:'var(--accent-soft)'}}>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <div className="mono" style={{fontSize:9, color:INK2, letterSpacing:1.5}}>CONTINUE</div>
            <Chip>auto-saved</Chip>
          </div>
          <div style={{fontFamily:'Frank Ruhl Libre', fontSize:19, color:INK, marginTop:6, lineHeight:1.25}}>
            Writing practice — <span className="heb">כ</span>, <span className="heb">ך</span>
          </div>
          <div style={{fontFamily:'Inter', fontSize:11, color:INK2, marginTop:4}}>3 of 8 · picks up where you left off</div>
          <div style={{marginTop:10}}><Btn primary>Resume</Btn></div>
        </SketchBox>

        {/* two peer tiles */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <SketchBox pad={10}>
            <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>PRACTICE</div>
            <Hatch w="100%" h={60} r={6} label="WORK"  style={{marginTop:6}}/>
            <div style={{fontFamily:'Inter', fontSize:11.5, color:INK, fontWeight:600, marginTop:6}}>Words, writing, phrases</div>
            <div className="mono" style={{fontSize:9, color:INK3, marginTop:2}}>14 due · 4 new</div>
          </SketchBox>
          <SketchBox pad={10}>
            <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>SONGS</div>
            <Hatch w="100%" h={60} r={6} label="ARRIVE" style={{marginTop:6}}/>
            <div style={{fontFamily:'Inter', fontSize:11.5, color:INK, fontWeight:600, marginTop:6}}>3 ready · 2 unlocking</div>
            <div className="mono" style={{fontSize:9, color:INK3, marginTop:2}}>tap to open</div>
          </SketchBox>
        </div>

        {/* quick shelf */}
        <SketchBox pad={12}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>ON YOUR SHELF</div>
            <div className="mono" style={{fontSize:9, color:INK3}}>SEE ALL ›</div>
          </div>
          <div style={{display:'flex', gap:6, marginTop:8, overflow:'hidden'}}>
            {['שָׁלוֹם','בֹּקֶר טוֹב','תּוֹדָה','מַיִם','אֲנִי','רוֹצֶה'].map((w,i)=>(
              <div key={i} className="heb" style={{padding:'5px 9px', borderRadius:6, border:`1px solid ${RULE}`, fontSize:15, color:INK, background: PAPER}}>{w}</div>
            ))}
          </div>
        </SketchBox>

        <SketchBox pad={12} style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:32, height:32, borderRadius:999, border:`1.25px solid ${INK}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'JetBrains Mono', fontSize:12}}>↻</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Inter', fontSize:12, fontWeight:600, color:INK}}>Daily review · 5 due</div>
            <div className="mono" style={{fontSize:9, color:INK3}}>~3 min · will feel easy</div>
          </div>
          <Caret/>
        </SketchBox>
      </div>

      <AtelierNav style={navStyle}/>
    </Phone>
  );
}

function AtelierLibrary(){
  return (
    <Phone label="LIBRARY · Direction 2" sub="songs as shelves, prep visible">
      <div style={{padding:'12px 18px'}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:24, color:INK}}>Songs</div>
        <div className="mono" style={{fontSize:10, color:INK3, marginTop:2}}>DESTINATIONS · GATED BY PREP</div>
      </div>
      <div style={{padding:'0 18px 10px', display:'flex', gap:6, overflow:'auto'}}>
        {['All','Folk','Modern','Short','Slow'].map((t,i)=>(
          <Pill key={i} active={i===0}>{t}</Pill>
        ))}
      </div>
      <div style={{padding:'0 18px', flex:1, display:'flex', flexDirection:'column', gap:10, overflow:'auto'}}>
        {[
          {t:'Yerushalayim Shel Zahav', a:'Naomi Shemer', p:100, ready:true},
          {t:'Bashana Haba\'ah', a:'Hurvitz / Manor', p:85, ready:false},
          {t:'Od Yavo\' Shalom', a:'Shalom Hanoch', p:40, ready:false},
          {t:'Kinneret', a:'Rachel', p:15, ready:false},
        ].map((s,i)=>(
          <SketchBox key={i} pad={10} style={{display:'flex', gap:10}}>
            <Hatch w={64} h={64} r={6} label="♪"/>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Frank Ruhl Libre', fontSize:14, color:INK, lineHeight:1.15}}>{s.t}</div>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:2}}>{s.a}</div>
              <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8}}>
                <div style={{flex:1, height:4, background:RULE, borderRadius:3, overflow:'hidden'}}>
                  <div style={{width: s.p+'%', height:'100%', background: s.ready? INK:'var(--accent)'}}/>
                </div>
                <div className="mono" style={{fontSize:9, color:INK3}}>{s.ready? 'OPEN':`${s.p}% PREP`}</div>
              </div>
            </div>
          </SketchBox>
        ))}
      </div>
      <BottomNav active={2} items={[
        {icon:'◐', label:'Home'},
        {icon:'✎', label:'Write'},
        {icon:'♪', label:'Songs'},
        {icon:'◑', label:'Me'},
      ]}/>
    </Phone>
  );
}

function AtelierLessonOverview(){
  return (
    <Phone label="LESSON OVERVIEW · Direction 2" sub="three chapters · your choice of order">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:2}}>LESSON</div>
        <div className="mono" style={{fontSize:11, color:INK3}}>⋯</div>
      </div>
      <div style={{padding:'4px 20px 10px'}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:24, color:INK, lineHeight:1.15}}>Bashana Haba'ah</div>
        <div className="mono" style={{fontSize:10, color:INK3, marginTop:4}}>3 CHAPTERS · ~22 MIN · FREE ORDER</div>
      </div>
      <div style={{padding:'6px 20px', flex:1, display:'flex', flexDirection:'column', gap:10, overflow:'auto'}}>
        {[
          {n:'I', t:'Words', s:'6 new, 4 review', d:'6 min', done:true},
          {n:'II', t:'Writing', s:'letters: ר ב ה', d:'7 min', done:false, hl:true},
          {n:'III', t:'Phrases & Sentences', s:'3 phrases, 1 chorus line', d:'9 min', done:false},
        ].map((c,i)=>(
          <SketchBox key={i} pad={14} style={{display:'flex', gap:14, alignItems:'center', background: c.hl?'var(--accent-soft)':'transparent'}}>
            <div style={{fontFamily:'Frank Ruhl Libre', fontSize:30, color: c.done? INK3: INK, width:36}}>{c.n}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Inter', fontSize:13, fontWeight:700, color:INK, textDecoration: c.done? 'line-through':'none'}}>{c.t}</div>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:3}}>{c.s} · {c.d}</div>
            </div>
            {c.done? <Chip>done</Chip>: <Caret/>}
          </SketchBox>
        ))}
        <SketchBox pad={12} style={{borderStyle:'dashed', borderColor:RULE, background: INK, color: PAPER}}>
          <div className="mono" style={{fontSize:9, letterSpacing:1.5, color:'#B8AF98'}}>DESTINATION · UNLOCKS AFTER ALL 3</div>
          <div style={{fontFamily:'Frank Ruhl Libre', fontSize:16, color:PAPER, marginTop:4}}>♪ Play the chorus with lyrics</div>
        </SketchBox>
      </div>
      <BottomNav active={2} items={[
        {icon:'◐', label:'Home'},
        {icon:'✎', label:'Write'},
        {icon:'♪', label:'Songs'},
        {icon:'◑', label:'Me'},
      ]}/>
    </Phone>
  );
}

Object.assign(window, { AtelierHome, AtelierLibrary, AtelierLessonOverview, AtelierNav, AtelierTopTabs });
