/* Synthetic offline training facility. Never reads the production database. */
(() => {
  'use strict';
  const facilityId='demo-anlaggning-v26';
  const bytesToBase64=bytes=>{
    const chunk=16384;let text='';
    for(let i=0;i<bytes.length;i+=chunk)text+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(text);
  };
  async function samplePdf(raster=false){
    if(!window.PDFLib)throw Error('PDF-biblioteket för övningsläget saknas.');
    const {PDFDocument,StandardFonts,rgb}=window.PDFLib,
      doc=await PDFDocument.create(),
      font=await doc.embedFont(StandardFonts.Helvetica),
      dark=rgb(.12,.22,.3),blue=rgb(.16,.43,.60);
    const cover=doc.addPage([840,590]);
    cover.drawText('DEMO - FIKTIV BRANDLARMSRITNING', {x:42,y:535,size:22,font,color:blue});
    cover.drawText('SEKTIONSFORTECKNING - OVNING', {x:42,y:495,size:17,font,color:dark});
    const rows=[
      '1   01.001 - 01.002   PLAN 1',
      '2   01.003 - 01.004   PLAN 1',
      '3   01.005   PLAN 1',
      'DEMO: samtliga namn, adresser och placeringar ar pafhittade.'
    ];
    rows.forEach((line,i)=>cover.drawText(line,{x:50,y:442-i*38,size:16,font,color:dark}));
    const page=doc.addPage([840,590]);
    if(raster){
      const canvas=document.createElement('canvas');canvas.width=1680;canvas.height=1180;
      const c=canvas.getContext('2d');
      c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
      c.strokeStyle='#23425a';c.lineWidth=5;c.strokeRect(70,70,1530,1010);
      c.beginPath();c.moveTo(780,70);c.lineTo(780,1080);c.stroke();
      c.beginPath();c.moveTo(70,560);c.lineTo(1600,560);c.stroke();
      c.font='40px Arial';c.fillStyle='#172b3b';
      c.fillText('DEMO - OCR-BILD, PLAN 1',100,130);
      const points=[['01.001',240,300],['01.002',1050,310],['01.003',260,760],['01.004',1080,760],['01.005',1320,920]];
      for(const [name,x,y] of points){c.beginPath();c.arc(x,y,32,0,Math.PI*2);c.stroke();c.fillText(name,x+46,y+12);}
      const png=await doc.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(png,{x:0,y:0,width:840,height:590});
      canvas.width=canvas.height=1;
    }else{
      page.drawText('DEMO - PDF MED LAGRADE TEXTER', {x:42,y:535,size:19,font,color:blue});
      page.drawRectangle({x:45,y:60,width:750,height:420,borderColor:dark,borderWidth:2});
      page.drawLine({start:{x:405,y:60},end:{x:405,y:480},color:dark,thickness:1.5});
      page.drawLine({start:{x:45,y:260},end:{x:795,y:260},color:dark,thickness:1.5});
      const pts=[['01.001',100,370],['01.002',470,370],['01.003',110,170],['01.004',470,170],['01.005',650,100]];
      for(const [a,x,y] of pts){page.drawCircle({x,y,size:13,borderColor:blue,borderWidth:2});page.drawText(a,{x:x+19,y:y-5,size:16,font,color:dark});}
    }
    return 'data:application/pdf;base64,'+bytesToBase64(await doc.save());
  }
  async function seed(){
    if(new URLSearchParams(location.search).get('demo')!=='1')throw Error('Övningsdata får endast skapas i övningsläget.');
    const db=window.localData, before=await db.snapshot();
    if(Object.keys(before).length)return false;
    const textPdf=await samplePdf(false),ocrPdf=await samplePdf(true),
      date=new Date().toISOString().slice(0,10),
      facility={id:facilityId,anlNr:'DEMO-0001',namn:'DEMO - Fiktivt brandlarmsobjekt',
        adress:'Testgatan 1 (påhittad)',central:'Fiktiv centralapparat',larmsandare:'Övningssändare',
        kontakt:'Ingen riktig kund',tele:'',skotare1:'Övningsansvarig',skotare2:''},
      devices=[
        {id:'demo-d1',central:'',slinga:'01',adress:'001',sektion:'1',typ:'Rökdetektor',placering:'Fiktivt kontor',lokalId:'',generation:1},
        {id:'demo-d2',central:'',slinga:'01',adress:'002',sektion:'1',typ:'Värmedetektor',placering:'Fiktivt pannrum',lokalId:'',generation:1},
        {id:'demo-d3',central:'',slinga:'01',adress:'003',sektion:'2',typ:'Rökdetektor',placering:'Fiktiv korridor',lokalId:'',generation:1}
      ],
      events=[
        {id:'demo-test-ok',kind:'test',deviceId:'demo-d1',generation:1,date,recordedAt:new Date().toISOString(),status:'Provad – OK',technician:'Övning',note:'',orderId:'demo-order'},
        {id:'demo-test-fel',kind:'test',deviceId:'demo-d2',generation:1,date,recordedAt:new Date().toISOString(),status:'Provad – anmärkning',technician:'Övning',note:'Övningsfel (fiktivt)',orderId:'demo-order'},
      ],
      issue={id:'demo-issue',group:'det:demo-d2:1',sources:['det:demo-test-fel'],title:'DEMO 01.002',note:'Övningsfel (fiktivt)',status:'Öppen',createdAt:new Date().toISOString(),timeline:[{at:new Date().toISOString(),status:'Öppen',note:'Fiktiv anmärkning',technician:'Övning'}]};
    const write={
      facilities:JSON.stringify([facility]),
      workorders:JSON.stringify([{id:'demo-order',facilityId,ordernummer:'DEMO-2026-001',uppdragstyp:'KV',planeradTill:date,status:'Påbörjat',notes:'Endast övning'}]),
      'history-index':'[]',
      ['docs:'+facilityId]:JSON.stringify([
        {id:'demo-pdf-text',mime:'application/pdf',description:'DEMO: planritning med PDF-text',namn:'DEMO TEXT'},
        {id:'demo-pdf-ocr',mime:'application/pdf',description:'DEMO: bildbaserad planritning för OCR',namn:'DEMO OCR'}
      ]),
      'docfile:demo-pdf-text':JSON.stringify(textPdf),
      'docfile:demo-pdf-ocr':JSON.stringify(ocrPdf),
      ['detectors:'+facilityId]:JSON.stringify({devices,events}),
      ['issues:'+facilityId]:JSON.stringify([issue]),
      ['fieldwork:'+facilityId]:JSON.stringify({visits:[],materials:[],plans:[],pins:[],prep:'FIKTIVA UPPGIFTER. Endast test.'})
    };
    await db.commitRecords(before,write);
    return true;
  }
  window.demoFixture={seed};
})();
