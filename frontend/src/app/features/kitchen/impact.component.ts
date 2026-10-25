import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KitchenService, Dish } from '../../core/services/kitchen.service';
import { STYLES, errMsg } from './shared';

@Component({
  selector: 'app-kitchen-impact', standalone: true, imports: [CommonModule, FormsModule], styles: [STYLES],
  template: `
  <h2>Impact</h2><p class="sub">Includes synthetic demo history if you loaded it. Real and synthetic record counts are listed per dish.</p>
  @if (msg) { <div class="msg err">{{ msg }}</div> }
  <div class="row"><div style="width:160px"><label for="dy">Period</label><select id="dy" [(ngModel)]="days" (change)="load()"><option [ngValue]="7">Last 7 days</option><option [ngValue]="30">Last 30 days</option><option [ngValue]="90">Last 90 days</option><option [ngValue]="365">Last year</option></select></div></div>
  @if (d) {
    <div class="grid" style="margin-top:10px">
      <div class="card"><span class="note">Food wasted</span><div class="big">{{ d.totalKg | number:'1.0-0' }} kg</div></div>
      <div class="card"><span class="note">Cost of waste</span><div class="big">₹{{ d.totalCostInr | number }}</div></div>
      <div class="card"><span class="note">Emissions</span><div class="big">{{ d.totalCo2eKg | number:'1.0-0' }} kg CO₂e</div></div>
      <div class="card"><span class="note">Donated</span><div class="big g">{{ d.donatedKg | number:'1.0-0' }} kg</div><span class="note">{{ d.meals }} meals</span></div></div>
    <div class="card"><h3>Waste trend (kg per day)</h3>
      <div style="display:flex;gap:3px;align-items:flex-end;height:120px;overflow-x:auto" role="img" aria-label="Daily waste in kilograms">
        @for (t of d.trend; track t.date) { <div style="text-align:center;font-size:9px;min-width:22px"><div>{{ t.kg }}</div><div class="bar" style="width:18px;margin:0 auto;border-radius:3px" [style.height.px]="t.kg / maxTrend * 90"></div><div>{{ t.date.slice(8) }}</div></div> }
      </div></div>
    <div class="card"><h3>Waste by dish</h3>
      @for (x of d.dishes; track x.dishId) {
        <div style="margin:8px 0"><div class="row sp"><span>{{ x.name }}</span><b>{{ x.kg }} kg</b></div><div class="track"><div class="bar" [style.width.%]="x.kg / maxDish * 100"></div></div>
        <span class="note">₹{{ x.costInr | number }}, {{ x.co2eKg }} kg CO₂e at ₹{{ x.costPerKg }}/kg and {{ x.co2ePerKg }} kg CO₂e/kg. Records: {{ x.realRecords }} real, {{ x.syntheticRecords }} synthetic.</span>
        <div><button class="alt" (click)="fp(x.dishId)">Fingerprint</button></div></div>}
      @if (fprint) { <div class="note"><b>Waste fingerprint</b><div>By weekday (avg kg): @for (w of fprint.byWeekday; track w.weekday) { <span>{{ names[w.weekday] }} {{ w.kg }} · </span> }</div>
        <div>By session: @for (s of fprint.bySession; track s.session) { <span>{{ s.session }} {{ s.kg }} kg · </span> }</div></div> }
    </div>
    <div class="card"><h3>What if we cook less?</h3><div class="grid">
      <div><label for="sd">Dish</label><select id="sd" [(ngModel)]="sim.dishId" (change)="run()">@for (x of d.dishes; track x.dishId) { <option [value]="x.dishId">{{ x.name }}</option> }</select></div>
      <div><label for="sw">Weekday</label><select id="sw" [(ngModel)]="sim.weekday" (change)="run()"><option [ngValue]="undefined">All days</option>@for (n of names; track $index) { <option [ngValue]="$index">{{ n }}</option> }</select></div></div>
      <label for="sp">Cook {{ sim.pct }}% less</label><input id="sp" type="range" min="0" max="30" [(ngModel)]="sim.pct" (input)="run()">
      @if (out) { <div class="big g">{{ out.kgPerWeek }} kg/week</div><div class="note">Saves ₹{{ out.costInr | number }} and {{ out.co2eKg }} kg CO₂e (₹{{ out.factors.costPerKg }}/kg, {{ out.factors.co2ePerKg }} kg CO₂e/kg). {{ out.assumption }}</div> }
    </div>}`
})
export class ImpactComponent implements OnInit {
  d: any = null; days = 30; msg = ''; fprint: any = null; out: any = null; maxTrend = 1; maxDish = 1;
  names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  sim: { dishId: string; pct: number; weekday?: number } = { dishId: '', pct: 10 };
  constructor(private k: KitchenService) {}
  ngOnInit() { this.load(); }
  load() {
    this.k.impact(this.days).subscribe({
      next: r => { this.d = r; this.maxTrend = Math.max(1, ...r.trend.map((t: any) => t.kg)); this.maxDish = Math.max(1, ...r.dishes.map((x: any) => x.kg)); if (!this.sim.dishId && r.dishes[0]) this.sim.dishId = r.dishes[0].dishId; this.run(); },
      error: e => (this.msg = errMsg(e))
    });
  }
  fp(id: string) { this.k.fingerprint(id).subscribe(r => (this.fprint = r)); }
  run() { if (!this.sim.dishId) return; this.k.simulate({ dishId: this.sim.dishId, pct: +this.sim.pct, ...(this.sim.weekday !== undefined && this.sim.weekday !== null ? { weekday: +this.sim.weekday } : {}) }).subscribe({ next: r => (this.out = r), error: e => (this.msg = errMsg(e)) }); }
}
