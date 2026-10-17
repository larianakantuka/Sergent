import { MongoClient } from 'mongodb';
let connected;
export function database(){
  if(!connected) connected=(async()=>{
    if(!process.env.MONGODB_URI) throw new Error('Missing MongoDB configuration');
    const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:5,serverSelectionTimeoutMS:8000,connectTimeoutMS:8000});
    try{await client.connect();const db=client.db(process.env.MONGODB_DB||'serg');
      await Promise.all([db.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),db.collection('attempts').createIndex({expiresAt:1},{expireAfterSeconds:0}),db.collection('links').createIndex({createdAt:-1})]);
      return db;
    }catch(error){await client.close();throw error;}
  })().catch(error=>{connected=undefined;throw error;});
  return connected;
}
