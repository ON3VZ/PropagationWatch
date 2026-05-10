/* SunCalc v1.9.0 - https://github.com/mourner/suncalc | BSD 2-Clause */
(function(){
'use strict';
var PI=Math.PI,sin=Math.sin,cos=Math.cos,tan=Math.tan,asin=Math.asin,atan=Math.atan2,acos=Math.acos,rad=PI/180;
var dayMs=1000*60*60*24,J1970=2440588,J2000=2451545;
function toJulian(date){return date.valueOf()/dayMs-0.5+J1970}
function fromJulian(j){return new Date((j+0.5-J1970)*dayMs)}
function toDays(date){return toJulian(date)-J2000}
var e=rad*23.4397;
function rightAscension(l,b){return atan(sin(l)*cos(e)-tan(b)*sin(e),cos(l))}
function declination(l,b){return asin(sin(b)*cos(e)+cos(b)*sin(e)*sin(l))}
function azimuth(H,phi,dec){return atan(sin(H),cos(H)*sin(phi)-tan(dec)*cos(phi))}
function altitude(H,phi,dec){return asin(sin(phi)*sin(dec)+cos(phi)*cos(dec)*cos(H))}
function siderealTime(d,lw){return rad*(280.16+360.9856235*d)-lw}
function astroRefraction(h){if(h<0)h=0;return 0.0002967/Math.tan(h+0.00312536/(h+0.08901179))}
function solarMeanAnomaly(d){return rad*(357.5291+0.98560028*d)}
function eclipticLongitude(M){
  var C=rad*(1.9148*sin(M)+0.02*sin(2*M)+0.0003*sin(3*M));
  var P=rad*102.9372;
  return M+C+P+PI;
}
function sunCoords(d){
  var M=solarMeanAnomaly(d),L=eclipticLongitude(M);
  return{dec:declination(L,0),ra:rightAscension(L,0)};
}
var SunCalc={};
SunCalc.getPosition=function(date,lat,lng){
  var lw=rad*-lng,phi=rad*lat,d=toDays(date),c=sunCoords(d),H=siderealTime(d,lw)-c.ra;
  return{azimuth:azimuth(H,phi,c.dec),altitude:altitude(H,phi,c.dec)};
};
var times=[[-0.833,'sunrise','sunset'],[-0.3,'sunriseEnd','sunsetStart'],[-6,'dawn','dusk'],
  [-12,'nauticalDawn','nauticalDusk'],[-18,'nightEnd','night'],[6,'goldenHourEnd','goldenHour']];
SunCalc.addTime=function(angle,riseName,setName){times.push([angle,riseName,setName])};
function getSetJ(h,lw,phi,dec,n,M,L){
  var w=acos((sin(h)-sin(phi)*sin(dec))/(cos(phi)*cos(dec)));
  var a=rightAscension(L,0);
  return n+0.0053*sin(M)-0.0069*sin(2*L)+(w+a)/(2*PI);
}
SunCalc.getTimes=function(date,lat,lng){
  var lw=rad*-lng,phi=rad*lat,d=toDays(date),n=Math.round(d),ds=n+0.0009-lng/360;
  var M=solarMeanAnomaly(ds),L=eclipticLongitude(M),dec=declination(L,0),Jnoon=J2000+ds+0.0053*sin(M)-0.0069*sin(2*L);
  var result={solarNoon:fromJulian(Jnoon),nadir:fromJulian(Jnoon-0.5)};
  for(var i=0,len=times.length;i<len;i+=1){
    var time=times[i],h0=(time[0])*rad;
    var Jset=getSetJ(h0,lw,phi,dec,n,M,L);
    var Jrise=Jnoon-(Jset-Jnoon);
    result[time[1]]=fromJulian(Jrise);
    result[time[2]]=fromJulian(Jset);
  }
  return result;
};
function moonCoords(d){
  var L=rad*(218.316+13.176396*d),M=rad*(134.963+13.064993*d),F=rad*(93.272+13.229350*d);
  var l=L+rad*6.289*sin(M),b=rad*5.128*sin(F),dt=385001-20905*cos(M);
  return{ra:rightAscension(l,b),dec:declination(l,b),dist:dt};
}
SunCalc.getMoonPosition=function(date,lat,lng){
  var lw=rad*-lng,phi=rad*lat,d=toDays(date),c=moonCoords(d),H=siderealTime(d,lw)-c.ra,h=altitude(H,phi,c.dec);
  h=h+astroRefraction(h);
  return{azimuth:azimuth(H,phi,c.dec),altitude:h,distance:c.dist};
};
SunCalc.getMoonIllumination=function(date){
  var d=toDays(date),s=sunCoords(d),m=moonCoords(d);
  var sdist=149598000,phi=acos(sin(s.dec)*sin(m.dec)+cos(s.dec)*cos(m.dec)*cos(s.ra-m.ra));
  var inc=atan(sdist*sin(phi),m.dist-sdist*cos(phi));
  var angle=atan(cos(s.dec)*sin(s.ra-m.ra),sin(s.dec)*cos(m.dec)-cos(s.dec)*sin(m.dec)*cos(s.ra-m.ra));
  return{fraction:(1+cos(inc))/2,phase:0.5+0.5*inc*(angle<0?-1:1)/PI,angle:angle};
};
function hoursLater(date,h){return new Date(date.valueOf()+h*dayMs/24)}
SunCalc.getMoonTimes=function(date,lat,lng,inUTC){
  var t=inUTC?new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())):new Date(date.getFullYear(),date.getMonth(),date.getDate());
  var hc=0.133*rad,h0=SunCalc.getMoonPosition(t,lat,lng).altitude-hc,rise,set,x1,x2,dx;
  for(var i=1;i<=24;i+=2){
    var h1=SunCalc.getMoonPosition(hoursLater(t,i),lat,lng).altitude-hc;
    var h2=SunCalc.getMoonPosition(hoursLater(t,i+1),lat,lng).altitude-hc;
    var a=(h0+h2)/2-h1,b=(h2-h0)/2,xe=-b/(2*a),ye=a*xe*xe+b*xe+h1;
    var d=b*b-4*a*h1,roots=0;
    if(d>=0){var dx2=Math.sqrt(d)/(Math.abs(a)*2),x1=xe-dx2,x2=xe+dx2;
      if(Math.abs(x1)<=1)roots++;
      if(Math.abs(x2)<=1)roots++;
      if(x1<-1)x1=x2;
    }
    if(roots===1){if(h0<0)rise=i+x1;else set=i+x1;}
    else if(roots===2){rise=i+(ye<0?x2:x1);set=i+(ye<0?x1:x2);}
    if(rise&&set)break;
    h0=h2;
  }
  var result={};
  if(rise)result.rise=hoursLater(t,rise);
  if(set)result.set=hoursLater(t,set);
  if(!rise&&!set)result[ye>0?'alwaysUp':'alwaysDown']=true;
  return result;
};
if(typeof exports!=='undefined'&&typeof module!=='undefined')module.exports=SunCalc;
if(typeof window!=='undefined')window.SunCalc=SunCalc;
})();
