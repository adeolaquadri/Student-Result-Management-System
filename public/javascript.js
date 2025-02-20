document.querySelector('#logout').addEventListener('click', (e)=>{
   if(confirm('Are sure you want to logout?') == true){
       fetch('/logout',{
       method: 'get'})
   }else{
       e.preventDefault()
   }
   
})
let date = new Date()
document.getElementById('cr').innerHTML = date.getFullYear();

function myFunction() {
var x = document.getElementById("sideBar");
if (x.style.display === "block") {
x.style.display = "none";
document.getElementById("mainContent").style.marginLeft = "0";
} else {
x.style.display = "block";
document.getElementById("mainContent").style.marginLeft = "180px";

}
}