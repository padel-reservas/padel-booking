'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_PLAYERS = 4;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Slot = {
  id: number;
  date: string;
  time: string;
};

type Player = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
};

export default function Page() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [nameInput, setNameInput] = useState<Record<number,string>>({});
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [date,setDate]=useState('');
  const [time,setTime]=useState('');

  async function loadData(){
    const {data:slotsData}=await supabase.from('slots').select('*').order('date').order('time');
    const {data:playersData}=await supabase.from('players').select('*');
    setSlots(slotsData||[]);
    setPlayers(playersData||[]);
  }

  useEffect(()=>{
    loadData();
  },[]);

  const slotsWithPlayers=useMemo(()=>{
    return slots.map(s=>({
      ...s,
      players:players.filter(p=>p.slot_id===s.id)
    }))
  },[slots,players])

  async function addPlayer(slotId:number){
    const name=nameInput[slotId];
    if(!name)return;

    await supabase.from('players').insert({
      slot_id:slotId,
      name,
      paid:false
    });

    setNameInput(v=>({...v,[slotId]:''}))
    loadData();
  }

  async function removePlayer(playerId:number){
    await supabase.from('players').delete().eq('id',playerId);
    loadData();
  }

  async function adminAction(action:any){
    const res=await fetch('/api/admin',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...action,pin})
    });

    if(res.ok)loadData();
    else alert('admin error');
  }

  return (
    <div style={{padding:30,fontFamily:'Arial'}}>
      <h1>Reservas de Pádel</h1>

      <button onClick={()=>setShowAdmin(!showAdmin)}>
        Admin
      </button>

      {showAdmin && !adminUnlocked && (
        <div style={{marginTop:20}}>
          <input
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={e=>setPin(e.target.value)}
          />
          <button onClick={()=>setAdminUnlocked(true)}>
            Entrar
          </button>
        </div>
      )}

      {adminUnlocked && (
        <div style={{marginTop:20}}>
          <h3>Crear turno</h3>

          <input
            type="date"
            value={date}
            onChange={e=>setDate(e.target.value)}
          />

          <input
            type="time"
            value={time}
            onChange={e=>setTime(e.target.value)}
          />

          <button
            onClick={()=>adminAction({
              action:'createSlot',
              date,
              time
            })}
          >
            Crear
          </button>
        </div>
      )}

      {slotsWithPlayers.map(slot=>(
        <div key={slot.id} style={{
          border:'1px solid #ddd',
          padding:15,
          marginTop:20
        }}>
          <h3>{slot.date} {slot.time}</h3>

          {adminUnlocked &&
            <button
              onClick={()=>adminAction({
                action:'deleteSlot',
                slotId:slot.id
              })}
            >
              borrar turno
            </button>
          }

          <div style={{marginTop:10}}>
            <input
              placeholder="nombre"
              value={nameInput[slot.id]||''}
              onChange={e=>setNameInput(v=>({...v,[slot.id]:e.target.value}))}
            />

            <button
              disabled={slot.players.length>=MAX_PLAYERS}
              onClick={()=>addPlayer(slot.id)}
            >
              Anotar
            </button>
          </div>

          <ul>
            {slot.players.map(p=>(
              <li key={p.id}>
                {p.name} {p.paid?'💰':''}

                <button onClick={()=>removePlayer(p.id)}>
                  borrar
                </button>

                {adminUnlocked &&
                  <button
                    onClick={()=>adminAction({
                      action:'togglePaid',
                      playerId:p.id,
                      paid:!p.paid
                    })}
                  >
                    pago
                  </button>
                }

              </li>
            ))}
          </ul>

        </div>
      ))}

    </div>
  );
}
