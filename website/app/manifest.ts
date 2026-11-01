import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {return {name:'Feedback Widget',short_name:'Feedback',description:'In-app feedback and bug reports by Human Quest',start_url:'/',display:'standalone',background_color:'#f8faf4',theme_color:'#566c42',icons:[{src:'/favicon.svg',sizes:'any',type:'image/svg+xml'}]};}
