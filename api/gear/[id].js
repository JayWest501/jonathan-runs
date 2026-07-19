import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
function isAdmin(req){ return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`; }
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  const {id}=req.query;
  if(req.method==='DELETE'){
    const {error}=await supabase.from('gear_items').delete().eq('id',id);
    if(error) return res.status(500).json({error:error.message});
    return res.status(200).json({success:true});
  }
  if(req.method==='PATCH'){
    const allowed=['name','category','type','status','note','icon','product_url','image_url','sort_order','published'];
    const updates={}; for(const k of allowed){ if(Object.prototype.hasOwnProperty.call(req.body||{},k)) updates[k]=req.body[k]; }
    const {data,error}=await supabase.from('gear_items').update(updates).eq('id',id).select().single();
    if(error) return res.status(500).json({error:error.message});
    return res.status(200).json(data);
  }
  return res.status(405).json({error:'Method not allowed'});
}
