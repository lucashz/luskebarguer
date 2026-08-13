import fs from 'node:fs'; import pg from 'pg';
for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const i=l.indexOf('=');if(i>0&&!l.startsWith('#'))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const p=new pg.Pool({connectionString:process.env.DATABASE_URL});
const out={};
out.accounts=(await p.query(`select id,username,mode,status,publishing_paused,token_expires_at,last_tested_at,last_error,scopes from social_accounts order by created_at desc`)).rows;
out.publications=(await p.query(`select p.id,p.status,p.scheduled_at,p.attempt_count,p.next_attempt_at,p.last_error_code,p.last_error,p.permalink,p.created_at,c.title,c.status content_status from social_publications p join marketing_content_items c on c.id=p.content_id order by p.created_at desc limit 10`)).rows;
out.runs=(await p.query(`select r.id,r.status,r.variant,r.updated_at,c.id content_id,c.status content_status,c.title from marketing_autopilot_runs r left join marketing_content_items c on c.id=r.content_id order by r.created_at desc limit 8`)).rows;
out.worker=(await p.query(`select * from social_worker_state`)).rows;
console.log(JSON.stringify(out,null,2));await p.end();
