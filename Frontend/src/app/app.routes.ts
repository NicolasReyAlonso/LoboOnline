import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { RoomPage } from './pages/room/room';

export const routes: Routes = [
  { path: '', component: Home, title: 'LoboOnline' },
  { path: 'sala/:code', component: RoomPage, title: 'Sala · LoboOnline' },
  { path: '**', redirectTo: '' },
];
