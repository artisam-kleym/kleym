from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor,white
from reportlab.lib.pagesizes import A4
ROOT=Path(__file__).resolve().parents[2]
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='QA',fontName='Helvetica',fontSize=9,leading=13,spaceAfter=8));styles.add(ParagraphStyle(name='Banner',fontName='Helvetica-Bold',fontSize=20,leading=25,textColor=white))
styles['Heading2'].textColor=HexColor('#354f6e');styles['Heading2'].keepWithNext=True
def p(t,s='QA'):return Paragraph(escape(t.replace('**','').replace('`','')).replace('\n','<br/>'),styles[s])
width=A4[0]-80;band=Table([[p('KLEYM / QA REVIEW\nResults and remaining release gates','Banner')]],colWidths=[width]);band.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),HexColor('#354f6e')),('TOPPADDING',(0,0),(-1,-1),15),('BOTTOMPADDING',(0,0),(-1,-1),15)]))
flow=[band,Spacer(1,12),p('26 October 2026 | Source, desktop, responsive and Android emulator proof')]
lines=(ROOT/'EXECUTION-SUMMARY.md').read_text(encoding='utf-8').splitlines();table=[]
for line in lines[2:]:
    if line.startswith('|'):
        if '---' in line:continue
        table.append([p(x.strip()) for x in line.strip('|').split('|')]);continue
    if table:
        t=Table(table,colWidths=[126,132,width-258]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),HexColor('#e2f5ec')),('LINEBELOW',(0,0),(-1,-1),.3,HexColor('#d8dee9')),('LEFTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),4)]));flow.extend([t,Spacer(1,12)]);table=[]
    if not line:continue
    if line.startswith('## '):flow.append(p(line[3:],'Heading2'))
    else:flow.append(p(line))
def footer(canvas,doc):canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#64748b'));canvas.drawString(40,20,'Kleym QA v2 | Scoped evidence; not blanket Mainnet certification');canvas.drawRightString(A4[0]-40,20,str(doc.page))
SimpleDocTemplate(str(ROOT/'kleym-qa-summary-v2.pdf'),pagesize=A4,leftMargin=40,rightMargin=40,topMargin=36,bottomMargin=38,title='Kleym QA results and release gates v2').build(flow,onFirstPage=footer,onLaterPages=footer)
