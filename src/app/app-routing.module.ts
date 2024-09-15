import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';

const routes: Routes = [
  { path: '', redirectTo: '/Home', pathMatch: 'full' }, // Redirect root path to HomeComponent
  { path: 'Home', component: HomeComponent },
{ path:"headersss" , component:HeaderComponent , },
{path :"login" , component:LoginComponent}

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
  
})
export class AppRoutingModule { 

}
