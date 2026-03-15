{!loading && activeTab === 'ranking' && (
  <div
    style={{
      background: 'white',
      borderRadius: 20,
      padding: 20,
      border: '1px solid #e5e7eb',
      overflowX: 'auto',
    }}
  >
    <h2 style={{ marginTop: 0 }}>Ranking</h2>

    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
          <th style={{ padding: '10px 8px' }}>#</th>
          <th style={{ padding: '10px 8px' }}>Jugador</th>
          <th style={{ padding: '10px 8px' }}>Puntos</th>
          <th style={{ padding: '10px 8px' }}>PJ</th>
          <th style={{ padding: '10px 8px' }}>G</th>
          <th style={{ padding: '10px 8px' }}>P</th>
          <th style={{ padding: '10px 8px' }}>%</th>
          <th style={{ padding: '10px 8px' }}>Prov.</th>
        </tr>
      </thead>
      <tbody>
        {[...rankingPlayers]
          .sort((a, b) => {
            if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
            if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
            return a.name.localeCompare(b.name);
          })
          .map((p, idx) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '10px 8px', fontWeight: 700 }}>{idx + 1}</td>
              <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.name}</td>
              <td style={{ padding: '10px 8px' }}>{Math.round(Number(p.display_rating))}</td>
              <td style={{ padding: '10px 8px' }}>{p.matches_played}</td>
              <td style={{ padding: '10px 8px' }}>{p.wins}</td>
              <td style={{ padding: '10px 8px' }}>{p.losses}</td>
              <td style={{ padding: '10px 8px' }}>{Number(p.win_pct).toFixed(2)}%</td>
              <td style={{ padding: '10px 8px' }}>{p.provisional ? 'Sí' : 'No'}</td>
            </tr>
          ))}
      </tbody>
    </table>
  </div>
)}
