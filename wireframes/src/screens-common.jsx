// Shared screens used across all three directions:
// Onboarding, Handwriting (3 layout variants), Phrase practice, Review, Progress, Destination

// ───────────────────────────────────────────────────────────────
// ONBOARDING (3 screens)
// ───────────────────────────────────────────────────────────────
function Onb1(){
  return (
    <Phone label="Onboarding · 1 of 3" sub="welcome, one sentence">
      <div style={{flex:1, padding:'30px 22px', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>Daber</div>
        </div>
        <div>
          <div className="heb" style={{fontSize:58, color:INK, lineHeight:1}}>דַּבֵּר</div>
          <div style={{fontFamily:'Frank Ruhl Libre', fontSize:26, lineHeight:1.2, color:INK, marginTop:18, letterSpacing:-.3}}>
            Learn Hebrew through<br/>phrases you'll actually say.
          </div>
          <div style={{fontFamily:'Inter', fontSize:13, color:INK2, marginTop:12, lineHeight:1.5, maxWidth: 240}}>
            Write by hand, speak phrases aloud, arrive at the songs you love.
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <Btn primary full>Begin</Btn>
          <div style={{textAlign:'center', fontFamily:'Inter', fontSize:11, color:INK3}}>I already have an account</div>
        </div>
      </div>
    </Phone>
  );
}

function Onb2(){
  const goals = [
    ['Read signs and menus','Short, everyday'],
    ['Understand Hebrew songs','Lyrics & meaning'],
    ['Hold a simple conversation','Phrases first'],
    ['Write Hebrew by hand','Stroke by stroke'],
  ];
  return (
    <Phone label="Onboarding · 2 of 3" sub="one goal, one placement">
      <div style={{flex:1, padding:'24px 20px', display:'flex', flexDirection:'column'}}>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>Step 2 / 3</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK, margin:'4px 0 14px', lineHeight:1.2}}>What pulls you toward Hebrew?</div>
        <div style={{display:'flex', flexDirection:'column', gap:8, flex:1}}>
          {goals.map((g,i)=>(
            <SketchBox key={i} pad={11} style={{display:'flex', alignItems:'center', gap:10, background: i===1?'var(--accent-soft)':'transparent'}}>
              <div style={{width:22, height:22, borderRadius:999, border:`1.25px solid ${INK2}`, background: i===1?INK:'transparent'}}/>
              <div style={{flex:1}}>
                <div style={{fontFamily:'Inter', fontSize:12.5, fontWeight:600, color:INK}}>{g[0]}</div>
                <div className="mono" style={{fontSize:9, color:INK3, marginTop:1}}>{g[1]}</div>
              </div>
            </SketchBox>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <Btn primary full>Continue</Btn>
        </div>
      </div>
    </Phone>
  );
}

function Onb3(){
  return (
    <Phone label="Onboarding · 3 of 3" sub="calibrate, don't test">
      <div style={{flex:1, padding:'24px 20px', display:'flex', flexDirection:'column'}}>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3, textTransform:'uppercase'}}>Step 3 / 3 · quick check</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:22, color:INK, margin:'4px 0 4px', lineHeight:1.2}}>Do any of these feel familiar?</div>
        <div style={{fontFamily:'Inter', fontSize:11, color:INK3, marginBottom:14}}>Tap anything you already know. Skip is fine.</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {['שלום','תודה','בוקר טוב','אני','אוהב','מה שלומך','סליחה','בבקשה','כן','לא','אוכל','מים'].map((w,i)=>(
            <div key={i} style={{
              padding:'8px 12px', borderRadius:999,
              border:`1px solid ${i%3===0?INK:RULE}`,
              background: i%3===0? 'var(--accent-soft)':'transparent',
              fontFamily:'Frank Ruhl Libre', fontSize:16, direction:'rtl',
              color:INK,
            }}>{w}</div>
          ))}
        </div>
        <div style={{marginTop:'auto', display:'flex', gap:8}}>
          <Btn>Skip</Btn>
          <Btn primary style={{flex:1}}>Start learning</Btn>
        </div>
      </div>
    </Phone>
  );
}

// ───────────────────────────────────────────────────────────────
// HANDWRITING — three layout variants (A, B, C)
// ───────────────────────────────────────────────────────────────
function HandCanvas({ variant='A' }){
  // Shared canvas (the sheet where the user writes)
  return (
    <div style={{
      position:'relative',
      border:`1.25px solid ${INK}`, borderRadius: 16,
      background:'#FBF7EC',
      height: variant==='C'? 300 : (variant==='B'? 230: 260),
      display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow:'inset 0 -3px 0 rgba(30,27,22,0.06)',
      overflow:'hidden',
    }}>
      {/* guideline rules */}
      <div style={{position:'absolute', left:14, right:14, top:'50%', height:0, borderTop:`1px dashed ${RULE}`}}/>
      <div style={{position:'absolute', left:14, right:14, bottom:'22%', height:0, borderTop:`1px dotted ${RULE}`}}/>
      <div style={{position:'absolute', left:14, right:14, top:'22%', height:0, borderTop:`1px dotted ${RULE}`}}/>
      {/* Ghosted guide letter */}
      <div className="heb" style={{
        fontSize: 170, color: 'rgba(30,27,22,0.1)', lineHeight:1,
        fontWeight:500,
      }}>שלום</div>
      {/* user stroke — faux handdrawn overlay */}
      <svg style={{position:'absolute', inset:0}} viewBox="0 0 300 260" preserveAspectRatio="none">
        <path d="M225 90 q -8 60 -25 85 M205 95 l 15 -5 M178 110 q -14 30 -10 60 q 2 15 12 20 M140 105 q 5 35 -2 70"
          fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      </svg>
      {/* Corner labels */}
      <div className="mono" style={{position:'absolute', top:8, left:10, fontSize:9, color:INK3, letterSpacing:1}}>CANVAS</div>
      <div className="mono" style={{position:'absolute', top:8, right:10, fontSize:9, color:INK3}}>⤺ undo</div>
      {/* RTL arrow */}
      <div className="mono" style={{position:'absolute', bottom:8, right:10, fontSize:9, color:INK3, letterSpacing:1}}>→ write ←  rtl</div>
    </div>
  );
}

function HandA(){
  // Variant A: Canvas-first — word at top, canvas dominates
  return (
    <Phone label="Handwriting · A" sub="canvas-dominant, calm" tint="#F3EDDC">
      <div style={{padding:'10px 16px 4px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3}}>WORD 3 / 8</div>
        <div style={{width:18, height:3, background:INK}}/>
      </div>
      <div style={{padding:'8px 16px', textAlign:'center'}}>
        <div className="heb" style={{fontSize:38, color:INK, lineHeight:1}}>שָׁלוֹם</div>
        <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:4}}>shalom · peace · hello</div>
      </div>
      <div style={{padding:'10px 16px', flex:1}}>
        <HandCanvas variant="A"/>
      </div>
      <div style={{padding:'0 16px 10px', display:'flex', gap:8, justifyContent:'center'}}>
        <Btn small>Hear it</Btn>
        <Btn small>Show strokes</Btn>
        <Btn small primary>Check ✓</Btn>
      </div>
      <div style={{padding:'0 16px 8px'}}>
        <div style={{display:'flex', gap:4, justifyContent:'center'}}>
          {[1,1,1,0,0,0,0,0].map((f,i)=>(
            <div key={i} style={{width:18, height:3, borderRadius:2, background: f?INK:RULE}}/>
          ))}
        </div>
      </div>
    </Phone>
  );
}

function HandB(){
  // Variant B: Split — reference panel on top, canvas bottom, scoring inline
  return (
    <Phone label="Handwriting · B" sub="reference + canvas split">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3}}>SESSION · WRITE</div>
        <div style={{width:18, height:3, background:INK}}/>
      </div>
      <div style={{padding:'6px 16px', flex:1, display:'flex', flexDirection:'column', gap:10}}>
        <SketchBox pad={12} style={{background:PAPER2}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
            <div>
              <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>REFERENCE</div>
              <div className="heb" style={{fontSize:34, color:INK, marginTop:2}}>בֹּקֶר טוֹב</div>
              <div style={{fontFamily:'Inter', fontSize:11, color:INK2, marginTop:2}}>boker tov · good morning</div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end'}}>
              <Chip>play 🔊</Chip>
              <Chip>strokes</Chip>
            </div>
          </div>
        </SketchBox>
        <HandCanvas variant="B"/>
        <SketchBox pad={8} style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <div className="mono" style={{fontSize:9, color:INK3}}>SCORE · LAST ATTEMPT</div>
            <div style={{fontFamily:'Inter', fontSize:14, fontWeight:700, color:INK}}>shape ✓ &nbsp; proportion ◐ &nbsp; order ✓</div>
          </div>
          <Btn small primary>Again</Btn>
        </SketchBox>
      </div>
      <div style={{padding:'0 16px 10px', display:'flex', gap:8}}>
        <Btn small>Skip</Btn>
        <Btn small full>Retry</Btn>
        <Btn small primary>Next →</Btn>
      </div>
    </Phone>
  );
}

function HandC(){
  // Variant C: Tablet-like landscape inside phone — full-bleed canvas + floating controls
  return (
    <Phone label="Handwriting · C" sub="full-bleed, floating controls" tint="#EFE9D6">
      <div style={{padding:'0', flex:1, position:'relative'}}>
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:`linear-gradient(to bottom, ${RULE} 1px, transparent 1px)`,
          backgroundSize:'100% 40px',
          opacity:0.4,
        }}/>
        {/* floating top pill */}
        <div style={{position:'absolute', top:12, left:12, right:12,
          display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <SketchBox pad={6} r={999} bg={PAPER}>
            <div style={{display:'flex', alignItems:'center', gap:6, padding:'0 6px'}}>
              <Caret dir="left"/>
              <div className="mono" style={{fontSize:9, color:INK2, letterSpacing:1.5}}>EXIT</div>
            </div>
          </SketchBox>
          <SketchBox pad={6} r={999} bg={PAPER}>
            <div className="heb" style={{fontSize:20, color:INK, padding:'0 10px'}}>לֶחֶם</div>
          </SketchBox>
          <SketchBox pad={6} r={999} bg={PAPER}>
            <div className="mono" style={{fontSize:10, color:INK2, padding:'0 8px'}}>4/8</div>
          </SketchBox>
        </div>
        {/* ghost letter */}
        <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div className="heb" style={{fontSize:180, color:'rgba(30,27,22,0.08)'}}>לֶחֶם</div>
        </div>
        {/* user strokes */}
        <svg style={{position:'absolute', inset:0}} viewBox="0 0 300 620" preserveAspectRatio="none">
          <path d="M220 260 q -10 90 -28 120 M190 270 l 15 -8 M155 280 q 4 60 -4 110"
            fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" opacity="0.9"/>
        </svg>
        {/* floating bottom toolbar */}
        <div style={{position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)'}}>
          <SketchBox pad={6} r={999} bg={PAPER} style={{display:'flex', gap:4}}>
            {['✎','↶','↷','⌫','✓'].map((g,i)=>(
              <div key={i} style={{
                width:34, height:34, borderRadius:999,
                border:`1px solid ${i===4?INK:RULE}`,
                background: i===4? INK: 'transparent',
                color: i===4? PAPER: INK,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'Inter', fontSize:14, fontWeight:600,
              }}>{g}</div>
            ))}
          </SketchBox>
        </div>
        <Annot side="left" style={{position:'absolute', bottom:90, right:10}}>
          submit = tap ✓<br/>no confirm modal
        </Annot>
      </div>
    </Phone>
  );
}

// ───────────────────────────────────────────────────────────────
// PHRASE / SENTENCE PRACTICE
// ───────────────────────────────────────────────────────────────
function PhrasePractice(){
  return (
    <Phone label="Phrase practice" sub="build, then say. mastery = unit.">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3}}>PHRASE · 2 of 5</div>
        <Pill>skip</Pill>
      </div>
      <div style={{padding:'8px 16px', flex:1, display:'flex', flexDirection:'column', gap:12}}>
        <SketchBox pad={14} bg={PAPER2}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>TRANSLATE THIS</div>
          <div style={{fontFamily:'Frank Ruhl Libre', fontSize:20, color:INK, marginTop:6, lineHeight:1.3}}>
            "I want a glass of water, please."
          </div>
          <div style={{marginTop:8}}>
            <Chip>familiar: 4/5</Chip>
          </div>
        </SketchBox>

        {/* Assembled target line */}
        <div style={{
          borderTop:`1px dashed ${RULE}`, borderBottom:`1px dashed ${RULE}`,
          padding:'14px 0', textAlign:'right',
        }}>
          <div className="heb" style={{fontSize:26, color:INK, lineHeight:1.3}}>
            <span style={{borderBottom:`2px solid ${INK}`}}>אֲנִי רוֹצֶה</span>
            <span style={{opacity:.3}}> ___ </span>
            <span style={{borderBottom:`2px solid ${INK}`}}>מַיִם</span>
            <span style={{opacity:.3}}> ___ </span>
          </div>
          <div className="mono" style={{fontSize:9, color:INK3, marginTop:4, textAlign:'right'}}>TAP WORDS TO FILL →</div>
        </div>

        {/* Word bank */}
        <div>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5, marginBottom:6}}>WORD BANK</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, justifyContent:'flex-end', direction:'rtl'}}>
            {['כּוֹס','שֶׁל','בְּבַקָּשָׁה','לֶחֶם','טוֹב','אִם'].map((w,i)=>(
              <div key={i} style={{
                padding:'7px 11px', borderRadius:8,
                border:`1.25px solid ${i<3?INK:RULE}`,
                fontFamily:'Frank Ruhl Libre', fontSize:17, color:INK,
                background: i<3? PAPER : 'transparent',
                opacity: i<3? 1: .5,
              }}>{w}</div>
            ))}
          </div>
        </div>

        <SketchBox pad={10} style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:36, height:36, borderRadius:999, border:`1.25px solid ${INK}`, display:'flex', alignItems:'center', justifyContent:'center'}}>🔊</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Inter', fontSize:12, fontWeight:600, color:INK}}>Say it out loud</div>
            <div className="mono" style={{fontSize:9, color:INK3, marginTop:1}}>OPTIONAL · TAP MIC TO RECORD</div>
          </div>
          <div style={{width:36, height:36, borderRadius:999, border:`1.25px solid ${INK}`, background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center'}}>●</div>
        </SketchBox>
      </div>
      <div style={{padding:'0 16px 10px', display:'flex', gap:8}}>
        <Btn>Hint</Btn>
        <Btn primary full>Check</Btn>
      </div>
    </Phone>
  );
}

// ───────────────────────────────────────────────────────────────
// REVIEW (daily queue) + RECAP
// ───────────────────────────────────────────────────────────────
function ReviewQueue(){
  const items = [
    ['שָׁלוֹם','hello / peace','4d'],
    ['בֹּקֶר טוֹב','good morning','2d'],
    ['אֲנִי רוֹצֶה','I want','1d'],
    ['בְּבַקָּשָׁה','please','now'],
    ['מַיִם','water','now'],
  ];
  return (
    <Phone label="Daily review queue" sub="what's due today">
      <div style={{padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Caret dir="left"/>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3}}>REVIEW · 5 DUE</div>
        <div style={{width:18, height:3, background:INK}}/>
      </div>
      <div style={{padding:'10px 16px 0'}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:24, color:INK, lineHeight:1.1}}>Review, gently.</div>
        <div style={{fontFamily:'Inter', fontSize:12, color:INK2, marginTop:4}}>5 items. About 3 minutes. Handwriting on half.</div>
      </div>
      <div style={{padding:'14px 16px', flex:1, display:'flex', flexDirection:'column', gap:8}}>
        {items.map((it,i)=>(
          <SketchBox key={i} pad={11} style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28, height:28, borderRadius:999, border:`1.25px solid ${i<2?INK:RULE}`, background:i<2?'var(--accent-soft)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'JetBrains Mono', fontSize:10}}>{i+1}</div>
            <div style={{flex:1}}>
              <div className="heb" style={{fontSize:20, color:INK, lineHeight:1}}>{it[0]}</div>
              <div style={{fontFamily:'Inter', fontSize:11, color:INK3, marginTop:2}}>{it[1]}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <Chip>write</Chip>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:3}}>last · {it[2]}</div>
            </div>
          </SketchBox>
        ))}
      </div>
      <div style={{padding:'0 16px 10px'}}>
        <Btn primary full>Begin review · 3 min</Btn>
      </div>
    </Phone>
  );
}

function Recap(){
  return (
    <Phone label="Session recap" sub="arrives after every session" tint="#F0EAD5">
      <div style={{padding:'16px 18px', flex:1, display:'flex', flexDirection:'column', gap:14}}>
        <div className="mono" style={{fontSize:9, letterSpacing:2, color:INK3}}>SESSION COMPLETE</div>
        <div>
          <div style={{fontFamily:'Frank Ruhl Libre', fontSize:30, color:INK, lineHeight:1.1}}>Nicely done.</div>
          <div style={{fontFamily:'Inter', fontSize:13, color:INK2, marginTop:6, lineHeight:1.5}}>
            You met <b>7 new words</b>, wrote <b>4</b>, and held <b>2 phrases</b> together.
          </div>
        </div>

        <SketchBox pad={12}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>WHAT YOU LEARNED</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:8, justifyContent:'flex-end', direction:'rtl'}}>
            {['שָׁלוֹם','בֹּקֶר','טוֹב','מַיִם','כּוֹס','רוֹצֶה','בְּבַקָּשָׁה'].map((w,i)=>(
              <div key={i} className="heb" style={{padding:'5px 10px', borderRadius:6, border:`1px solid ${RULE}`, fontSize:16, color:INK, background:PAPER}}>{w}</div>
            ))}
          </div>
        </SketchBox>

        <SketchBox pad={12}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>HANDWRITING</div>
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <Hatch w={64} h={64} r={8} label="י" dense/>
            <Hatch w={64} h={64} r={8} label="ם" dense/>
            <Hatch w={64} h={64} r={8} label="כ" dense/>
          </div>
          <div style={{fontFamily:'Inter', fontSize:11, color:INK2, marginTop:8}}>3 of 4 letters: clean form. Final <span className="heb">ך</span> — practice again tomorrow.</div>
        </SketchBox>

        <SketchBox pad={12} bg={'var(--accent-soft)'}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>TOMORROW</div>
          <div style={{fontFamily:'Inter', fontSize:12.5, color:INK, marginTop:4, fontWeight:600}}>5 reviews · 1 new phrase · 1 song line</div>
        </SketchBox>
      </div>
      <div style={{padding:'0 16px 10px', display:'flex', gap:8}}>
        <Btn>Share</Btn>
        <Btn primary full>Done</Btn>
      </div>
    </Phone>
  );
}

// ───────────────────────────────────────────────────────────────
// PROGRESS / HISTORY
// ───────────────────────────────────────────────────────────────
function Progress(){
  return (
    <Phone label="Progress" sub="trails, not trophies">
      <div style={{padding:'14px 18px 0'}}>
        <div className="mono" style={{fontSize:10, color:INK3, letterSpacing:2}}>PROGRESS</div>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:28, color:INK, lineHeight:1.1, marginTop:2}}>42 days in.</div>
      </div>
      <div style={{padding:'10px 18px', display:'flex', gap:6}}>
        {['Overview','Words','Writing','Songs'].map((t,i)=>(
          <Pill key={i} active={i===0}>{t}</Pill>
        ))}
      </div>

      <div style={{padding:'4px 18px', flex:1, display:'flex', flexDirection:'column', gap:12}}>
        {/* calendar trail */}
        <SketchBox pad={12}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>YOUR TRAIL · LAST 8 WEEKS</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(14, 1fr)', gap:3, marginTop:10}}>
            {Array.from({length: 14*5}).map((_,i)=>{
              const intensity = [0,0,1,1,2,3,2,1,0,1,2,3,3,2][i%14];
              const bg = intensity===0? RULE : intensity===1? 'var(--accent-soft)' : intensity===2? 'var(--accent-2)':'var(--accent)';
              return <div key={i} style={{aspectRatio:'1/1', borderRadius:3, background: bg, opacity: intensity===0? .4: 1}}/>;
            })}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', fontFamily:'JetBrains Mono', fontSize:9, color:INK3, marginTop:6}}>
            <span>8 WEEKS AGO</span><span>TODAY</span>
          </div>
        </SketchBox>

        {/* metrics */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {[['184','words known'],['62','phrases'],['7','songs unlocked'],['9m','avg/day']].map((m,i)=>(
            <SketchBox key={i} pad={12}>
              <div style={{fontFamily:'Frank Ruhl Libre', fontSize:26, color:INK, lineHeight:1}}>{m[0]}</div>
              <div className="mono" style={{fontSize:9, color:INK3, marginTop:4, letterSpacing:1.5, textTransform:'uppercase'}}>{m[1]}</div>
            </SketchBox>
          ))}
        </div>

        {/* mastery list */}
        <SketchBox pad={12}>
          <div className="mono" style={{fontSize:9, color:INK3, letterSpacing:1.5}}>RECENT PHRASES · MASTERY</div>
          <div style={{display:'flex', flexDirection:'column', gap:7, marginTop:8}}>
            {[['I want a glass of water',85],['Good morning',95],['What is your name',40],['Thank you very much',72]].map((it,i)=>(
              <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
                <div style={{flex:1, fontFamily:'Inter', fontSize:11.5, color:INK}}>{it[0]}</div>
                <div style={{width:80, height:5, background:RULE, borderRadius:3, overflow:'hidden'}}>
                  <div style={{width: it[1]+'%', height:'100%', background: INK}}/>
                </div>
                <div className="mono" style={{fontSize:9, color:INK3, width:28, textAlign:'right'}}>{it[1]}%</div>
              </div>
            ))}
          </div>
        </SketchBox>
      </div>
    </Phone>
  );
}

// ───────────────────────────────────────────────────────────────
// DESTINATION — song / clip playback after earning it
// ───────────────────────────────────────────────────────────────
function Destination(){
  return (
    <Phone label="The destination" sub="content is the reward" tint="#1E1B16">
      <div style={{padding:'14px 16px 0', color:PAPER}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{color:PAPER}}><Caret dir="down" c={PAPER}/></div>
          <div className="mono" style={{fontSize:9, letterSpacing:2, color:'#B8AF98'}}>NOW PLAYING</div>
          <div style={{fontFamily:'JetBrains Mono', fontSize:12, color:PAPER}}>⋯</div>
        </div>
      </div>
      <div style={{padding:'14px 16px 10px'}}>
        <Hatch w="100%" h={170} r={12} label="SONG ARTWORK · 1:1" style={{borderColor:'#5A5040', background: `repeating-linear-gradient(135deg, transparent 0 8px, rgba(246,242,233,0.1) 8px 9px)`}}/>
      </div>
      <div style={{padding:'0 18px', color:PAPER}}>
        <div style={{fontFamily:'Frank Ruhl Libre', fontSize:20, color:PAPER}}>Song Title · Artist</div>
        <div className="mono" style={{fontSize:10, color:'#B8AF98', marginTop:4, letterSpacing:1.5}}>LYRICS · LINE 4 OF 18</div>
      </div>
      <div style={{padding:'10px 18px', flex:1, color:PAPER, fontFamily:'Frank Ruhl Libre', direction:'rtl', textAlign:'right'}}>
        <div style={{fontSize:13, color:'#8A8273', lineHeight:1.8}}>...הַיּוֹם אֲנִי שָׁר</div>
        <div style={{fontSize:19, color:PAPER, lineHeight:1.6, marginTop:6}}>
          <span style={{borderBottom:`1px solid ${PAPER}`}}>שָׁלוֹם</span> לָעִיר הַזֹּאת
        </div>
        <div style={{fontSize:13, color:'#8A8273', lineHeight:1.8, marginTop:4}}>וְלַשֶּׁמֶשׁ שֶׁעוֹלָה</div>
        <div style={{fontSize:13, color:'#8A8273', lineHeight:1.8}}>...</div>
        <div className="mono" style={{fontSize:9, color:'#8A8273', marginTop:10, direction:'ltr', textAlign:'left'}}>TAP ANY WORD → DEFINITION + ADD TO QUEUE</div>
      </div>
      {/* mini controls */}
      <div style={{padding:'0 18px 6px'}}>
        <div style={{height:2, background:'#4A4436', borderRadius:2, overflow:'hidden'}}>
          <div style={{width:'38%', height:'100%', background:PAPER}}/>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', fontFamily:'JetBrains Mono', fontSize:9, color:'#8A8273', marginTop:4}}>
          <span>1:14</span><span>3:02</span>
        </div>
      </div>
      <div style={{padding:'4px 18px 12px', display:'flex', justifyContent:'center', gap:22, color:PAPER, fontSize:18}}>
        <span>⤺</span><span>◁◁</span>
        <div style={{width:44, height:44, borderRadius:999, background:PAPER, color:INK, display:'flex', alignItems:'center', justifyContent:'center'}}>▶</div>
        <span>▷▷</span><span>♡</span>
      </div>
    </Phone>
  );
}

Object.assign(window, {
  Onb1, Onb2, Onb3,
  HandA, HandB, HandC,
  PhrasePractice, ReviewQueue, Recap, Progress, Destination,
});
