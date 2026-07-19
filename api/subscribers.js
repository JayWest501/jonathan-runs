import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
function isAdmin(req){ return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`; }
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized'});
  if(req.method==='GET'){
    const {data,error}=await supabase.from('subscribers').select('*').order('subscribed_at',{ascending:false});
    if(error) return res.status(500).json({error:error.message});
    return res.status(200).json(data);
  }
  if(req.method==='DELETE'){
    const id=req.query.id; if(!id) return res.status(400).json({error:'id required'});
    const {error}=await supabase.from('subscribers').delete().eq('id',id);
    if(error) return res.status(500).json({error:error.message});
    return res.status(200).json({success:true});
  }
  return res.status(405).json({error:'Method not allowed'});
}
