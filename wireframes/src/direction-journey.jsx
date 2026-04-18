// DIRECTION 3 — "JOURNEY"
// IA: songs are the map. Each song = a journey of stations (words → write → phrase → line → play).
// Home = a map of songs you're traveling through. No separate library.
// Nav: drawer (menu icon top-left) + persistent now-playing-journey mini bar.

function JourneyHome(){
  const journeys = [
    {t:'Yerushalayim Shel Zahav', prog:0.62, cur:'Phrases'},
    {t:'Bashana Haba\'ah', prog:0.25, cur:'Words'},
    {t:'Kinneret', prog:0, cur:'Begin'},
  ];
  return (
    <Phone label="HOME · Direction 3 (Journey)" sub="songs ARE the map · drawer nav">
      <div style={{padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{width:22, height:14, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
          <div style={{height:1.5, background:INK}}/><div style={{height:1.5, background:INK, width:'70%'}}/><div style={{height:1.5, background:INK}}/>
        </div>
        <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3}}>JOURNEYS</div>
        <div style={{fontFamily:'JetBrains Mono', fontSize:11, color:INK3}}>⌕</div>
      </div>
      <div style={{padding:'4px 18px 8px'}}>
        <div className="hand" style={{fontSize:18, color:INK3}}>today you're between</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:24, color:INK, lineHeight:1.15}}>a few songs.</div>
      </div>

      <div style={{padding:'4px 18px', flex:1, display:'flex', flexDirection:'column', gap:12, overflow:'auto'}}>
        {journeys.map((j,i)=>(
          <SketchBox key={i} pad={14}>
            <div style={{display:'flex', gap:10, alignItems:'center'}}>
              <Hatch w={48} h={48} r={6} label="♪"/>
              <div style={{flex:1}}>
                <div style={{fontFamily:'Frank Ruhl Libre', fontSize:15, color:INK, lineHeight:1.15}}>{j.t}</div>
                <div className="mono" style={{fontSize:9, color:INK3, marginTop:2}}>NEXT: {j.cur.toUpperCase()}</div>
              </div>
              <Caret/>
            </div>
            {/* station trail */}
            <div style={{marginTop:12, display:'flex', alignItems:'center', gap:4}}>
              {['Words','Write','Phrase','Line','Song'].map((st,k)=>{
                const done = (k/4) < j.prog;
                const cur = Math.abs((k/4) - j.prog) < 0.12;
                return (
                  <React.Fragment key={k}>
                    <div style={{
                      width:18, height:18, borderRadius:999,
                      border:`1.25px solid ${done||cur?INK:RULE}`,
                      background: done? INK : (cur? 'var(--accent-soft)':'transparent'),
                    }}/>
                    {k<4 && <div style={{flex:1, height:1.5, background: done? INK:RULE, borderRadius:2}}/>}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop:4, fontFamily:'JetBrains Mono', fontSize:8, color:INK3, letterSpacing:1}}>
              <span>WORDS</span><span>WRITE</span><span>PHRASE</span><span>LINE</span><span>SONG</span>
            </div>
          </SketchBox>
        ))}

        <div style={{textAlign:'center', marginTop:6}}>
          <Btn>+ Start a new journey</Btn>
        </div>
      </div>

      {/* persistent resume bar */}
      <div style={{padding:'0 14px 10px'}}>
        <SketchBox pad={10} bg={INK} style={{color:PAPER, borderColor:INK, display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:28, height:28, borderRadius:999, background:PAPER, color:INK, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'JetBrains Mono', fontSize:12}}>▶</div>
          <div style={{flex:1}}>
            <div className="mono" style={{fontSize:9, color:'#B8AF98', letterSpacing:1.5}}>RESUME</div>
            <div style={{fontFamily:'Inter', fontSize:12, fontWeight:600, color:PAPER}}>Yerushalayim · Phrase 2 of 3</div>
          </div>
          <Caret c={PAPER}/>
        </SketchBox>
      </div>
    </Phone>
  );
}

function JourneyMap(){
  // The song-as-map: stations laid out on a curving path
  const stations = [
    {t:'Meet the words', s:'8 words', done:true, x:15, y:10},
    {t:'Write the letters', s:'ז ר ע', done:true, x:70, y:20},
    {t:'Phrases', s:'2 of 3', hl:true, x:20, y:38},
    {t:'Sentence', s:'from chorus', x:72, y:55},
    {t:'Full line', s:'with audio', x:22, y:72},
    {t:'Play', s:'destination', dest:true, x:70, y:88},
  ];
  return (
    <Phone label="JOURNEY MAP · Direction 3" sub="lesson = map of stations">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:2}}>JOURNEY</div>
        <div className="mono" style={{fontSize:11, color:INK3}}>⋯</div>
      </div>
      <div style={{padding:'4px 18px'}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK, lineHeight:1.1}}>Yerushalayim Shel Zahav</div>
        <div className="mono" style={{fontSize:10, color:INK3, marginTop:3}}>6 STATIONS · 62% THROUGH</div>
      </div>

      <div style={{padding:'8px 0', flex:1, position:'relative'}}>
        {/* curving path */}
        <svg style={{position:'absolute', inset:0}} viewBox="0 0 300 520" preserveAspectRatio="none">
          <path d="M 60 50 Q 250 70, 220 130 T 80 220 T 240 300 T 80 390 T 220 470"
            fill="none" stroke={INK2} strokeWidth="1.5" strokeDasharray="4,5" strokeLinecap="round"/>
        </svg>
        {stations.map((s,i)=>(
          <div key={i} style={{
            position:'absolute', left: s.x+'%', top: s.y+'%',
            transform:'translate(-50%,-50%)',
            display:'flex', flexDirection:'column', alignItems:'center', gap:4,
            maxWidth: 140,
          }}>
            <div style={{
              width:30, height:30, borderRadius:999,
              border:`1.5px solid ${s.done||s.hl||s.dest?INK:RULE}`,
              background: s.done? INK : s.hl? 'var(--accent-soft)' : s.dest? PAPER2:'transparent',
              color: s.done? PAPER: INK,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700,
            }}>{s.dest? '♪': s.done? '✓': i+1}</div>
            <SketchBox pad={6} r={8} bg={PAPER} style={{textAlign:'center', opacity: s.done?.55:1}}>
              <div style={{fontFamily:'Inter', fontSize:10.5, fontWeight:700, color:INK}}>{s.t}</div>
              <div className="mono" style={{fontSize:8.5, color:INK3, marginTop:1}}>{s.s}</div>
            </SketchBox>
          </div>
        ))}
        <Annot side="right" style={{position:'absolute', right:6, bottom:8}}>
          destination is<br/>always in view
        </Annot>
      </div>

      <div style={{padding:'0 14px 10px'}}>
        <Btn primary full>Continue · Phrases</Btn>
      </div>
    </Phone>
  );
}

function JourneyDrawer(){
  // The drawer reveal — shows the whole IA in Direction 3
  return (
    <Phone label="DRAWER · Direction 3" sub="whole IA in one menu">
      <div style={{display:'flex', flex:1}}>
        <div style={{width:'78%', borderRight:`1px solid ${RULE}`, padding:'14px 16px', display:'flex', flexDirection:'column', gap:14, background:PAPER}}>
          <div className="mono" style={{fontSize:10, color:INK3, letterSpacing:2}}>◐ DABER</div>
          <div>
            <div style={{fontFamily:'Frank Ruhl Libre', fontSize:18, color:INK}}>Ari Cohen</div>
            <div className="mono" style={{fontSize:10, color:INK3, marginTop:2}}>DAY 42 · STREAK 14</div>
          </div>
          <Rule/>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {[
              ['◎','Journeys','active'],
              ['♪','All songs'],
              ['✎','Writing practice'],
              ['↻','Daily review','5 due'],
              ['✧','Phrasebook','184 words'],
              ['◔','Progress'],
              ['◑','Notebook','your notes'],
            ].map((r,i)=>(
              <div key={i} style={{display:'flex', gap:12, alignItems:'center', padding:'4px 0',
                color: r[2]==='active'? INK: INK2, fontWeight: r[2]==='active'? 700: 500}}>
                <span style={{fontFamily:'JetBrains Mono', fontSize:13, width:18}}>{r[0]}</span>
                <div style={{flex:1, fontFamily:'Inter', fontSize:13}}>{r[1]}</div>
                {r[2] && r[2]!=='active' && <span className="mono" style={{fontSize:9, color:INK3}}>{r[2]}</span>}
              </div>
            ))}
          </div>
          <Rule/>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {['Settings','Help','Sign out'].map((t,i)=>(
              <div key={i} style={{fontFamily:'Inter', fontSize:12, color:INK3}}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{flex:1, background:'rgba(30,27,22,0.25)'}}/>
      </div>
    </Phone>
  );
}

Object.assign(window, { JourneyHome, JourneyMap, JourneyDrawer });
