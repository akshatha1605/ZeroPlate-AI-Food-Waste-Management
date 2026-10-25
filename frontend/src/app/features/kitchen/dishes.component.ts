import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KitchenService, Dish } from '../../core/services/kitchen.service';
import { STYLES, errMsg } from './shared';

@Component({
  selector: 'app-kitchen-dishes', standalone: true, imports: [CommonModule, FormsModule], styles: [STYLES],
  template: `
  <h2>Dishes</h2><p class="sub">Your menu items, with cost, CO₂e and safe holding times used by every other page.</p>
  @if (msg) { <div class="msg" [class.err]="isErr">{{ msg }}</div> }
  @for (d of dishes; track d._id) {
    <div class="card row sp"><div><b>{{ d.name }}</b><div class="note">₹{{ d.costPerKg }}/kg, {{ d.co2ePerKg }} kg CO₂e/kg. Safe: hot {{ d.hotHours }} h, chilled {{ d.chillHours }} h, room {{ d.ambHours }} h</div></div>
    <button class="alt" (click)="remove(d)">Remove</button></div>
  }
  @if (!dishes.length) { <div class="card">No dishes yet. <button class="alt" (click)="seed()">Load labeled demo data</button></div> }
  <div class="card"><h3>Add dish</h3>
    <div class="grid">
      <div><label for="n">Name</label><input id="n" [(ngModel)]="f.name"></div>
      <div><label for="c">Cost per kg (₹)</label><input id="c" type="number" [(ngModel)]="f.costPerKg"></div>
      <div><label for="e">CO₂e per kg</label><input id="e" type="number" [(ngModel)]="f.co2ePerKg"></div>
      <div><label for="h">Safe hours, hot-held</label><input id="h" type="number" [(ngModel)]="f.hotHours"></div>
      <div><label for="ch">Safe hours, chilled</label><input id="ch" type="number" [(ngModel)]="f.chillHours"></div>
      <div><label for="a">Safe hours, room temp</label><input id="a" type="number" [(ngModel)]="f.ambHours"></div>
    </div><div style="margin-top:10px"><button (click)="add()">Add dish</button></div>
    <p class="note">Safe holding times are conservative defaults. Verify them against current local food-safety guidance.</p></div>`
})
export class DishesComponent implements OnInit {
  dishes: Dish[] = []; msg = ''; isErr = false;
  f: Partial<Dish> = { co2ePerKg: 1, hotHours: 4, chillHours: 24, ambHours: 2 };
  constructor(private k: KitchenService) {}
  ngOnInit() { this.load(); }
  load() { this.k.dishes().subscribe(r => (this.dishes = r.dishes)); }
  private done(m: string) { this.msg = m; this.isErr = false; this.load(); }
  private fail(e: any) { this.msg = errMsg(e); this.isErr = true; }
  add() { this.k.addDish(this.f).subscribe({ next: () => { this.f = { co2ePerKg: 1, hotHours: 4, chillHours: 24, ambHours: 2 }; this.done('Dish added.'); }, error: e => this.fail(e) }); }
  remove(d: Dish) { this.k.deleteDish(d._id).subscribe({ next: () => this.done('Removed.'), error: e => this.fail(e) }); }
  seed() { this.k.demoSeed().subscribe({ next: () => this.done('Demo data loaded (labeled synthetic).'), error: e => this.fail(e) }); }
}
