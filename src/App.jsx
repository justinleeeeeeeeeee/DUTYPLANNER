// duty-scheduler-app
// React + Tailwind + CSV download version with full logic

import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [csvData, setCsvData] = useState(null);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const handleCsvUpload = (e) => {
    Papa.parse(e.target.files[0], {
      header: true,
      complete: (results) => {
        const parsed = results.data.filter(row => row.Name && !isNaN(parseFloat(row.Points)));
        setCsvData(parsed.map(row => ({
          name: row.Name.trim(),
          points: parseFloat(row.Points),
          assigned: 0,
          schedule: []
        })));
      }
    });
  };

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    const [year, month] = monthYear.split('-');

    lines.forEach(line => {
      const nameMatch = line.match(/^([A-Za-z\s]+):?/);
      if (!nameMatch) return;
      const name = nameMatch[1].trim().toLowerCase();
      const rawDates = line.replace(/^.*?:?\s*/, '').replace(/(can't do|on leave|due to .*?)?/gi, '').trim();

      const dateParts = rawDates.split(',').flatMap(part => part.split(/\band\b/)).map(p => p.trim());
      const dates = [];

      dateParts.forEach(part => {
        let range = part.match(/(\d{1,2})(?:\/(\d{1,2})\/(\d{2,4}))?\s*(?:[-–to]+\s*(\d{1,2})(?:\/(\d{1,2})\/(\d{2,4}))?)?/);
        if (range) {
          const d1 = parse(range[1] + ' ' + month + ' ' + year, 'd M yyyy', new Date());
          if (range[4]) {
            const d2 = parse(range[4] + ' ' + (range[5] || month) + ' ' + (range[6] || year), 'd M yyyy', new Date());
            let cur = new Date(d1);
            while (cur <= d2) {
              dates.push(format(cur, 'yyyy-MM-dd'));
              cur.setDate(cur.getDate() + 1);
            }
          } else {
            dates.push(format(d1, 'yyyy-MM-dd'));
          }
        } else if (/\d{1,2}\s*[A-Za-z]{3,}/.test(part)) {
          const d = parse(part + ' ' + year, 'd MMM yyyy', new Date());
          dates.push(format(d, 'yyyy-MM-dd'));
        }
      });

      result[name] = (result[name] || []).concat(dates);
    });

    setBlockedParsed(result);
    setConfirmed(true);
  };

  const isBlocked = (name, date) => {
    const blocked = blockedParsed?.[name.toLowerCase()] || [];
    return blocked.includes(date);
  };

  const assignDuty = (type, dateStr, allAssignments, assignedSoFar) => {
    const dayBefore = format(new Date(new Date(dateStr).setDate(new Date(dateStr).getDate() - 1)), 'yyyy-MM-dd');
    const dayAfter = format(new Date(new Date(dateStr).setDate(new Date(dateStr).getDate() + 1)), 'yyyy-MM-dd');

    const eligible = csvData.filter(p => {
      const n = p.name.toLowerCase();
      if (type === 'AM' || type === 'PM') {
        if (p.assigned >= MAX_DUTY_POINTS) return false;
        if (assignedSoFar[n] && assignedSoFar[n].includes(dateStr)) return false;
        if (type === 'AM' && (assignedSoFar[n]?.includes(dayBefore + '_PM') || assignedSoFar[n]?.includes(dayAfter + '_PM'))) return false;
        if (type === 'PM' && (assignedSoFar[n]?.includes(dayBefore + '_PM') || assignedSoFar[n]?.includes(dayAfter + '_PM'))) return false;
      }
      if (type === 'AMR' || type === 'PMR') {
        if (assignedSoFar[n]?.includes(dayBefore) || assignedSoFar[n]?.includes(dayAfter)) return false;
      }
      if (isBlocked(n, dateStr)) return false;
      return true;
    });

    eligible.sort((a, b) => a.points + a.assigned - (b.points + b.assigned));
    const pick = eligible[0];
    if (!pick) return '';
    const n = pick.name.toLowerCase();
    assignedSoFar[n] = assignedSoFar[n] || [];
    assignedSoFar[n].push(type === 'AM' || type === 'PM' ? dateStr + '_' + type : dateStr);
    if (type === 'AM' || type === 'PM') pick.assigned++;
    allAssignments[dateStr] = allAssignments[dateStr] || { AM: '', PM: '', AMR: [], PMR: [] };
    if (type === 'AM') allAssignments[dateStr].AM = pick.name;
    if (type === 'PM') allAssignments[dateStr].PM = pick.name;
    if (type === 'AMR') allAssignments[dateStr].AMR.push(pick.name);
    if (type === 'PMR') allAssignments[dateStr].PMR.push(pick.name);
    return pick.name;
  };

  const generateSchedule = () => {
    const [year, month] = monthYear.split('-');
    const days = new Date(year, month, 0).getDate();
    const assignments = {}, assignedSoFar = {};

    for (let i = 1; i <= days; i++) {
      const date = format(new Date(year, month - 1, i), 'yyyy-MM-dd');
      ['AM', 'PM', 'AMR', 'AMR', 'PMR', 'PMR'].forEach(type => assignDuty(type, date, assignments, assignedSoFar));
    }

    const rows = Array.from({ length: days }, (_, i) => {
      const dateObj = new Date(year, month - 1, i + 1);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const a = assignments[dateStr] || {};
      return {
        Date: format(dateObj, 'd/M/yyyy'),
        Day: format(dateObj, 'EEE'),
        AM: a.AM || '',
        PM: a.PM || '',
        'AM Reserve 1': a.AMR?.[0] || '',
        'AM Reserve 2': a.AMR?.[1] || '',
        'PM Reserve 1': a.PMR?.[0] || '',
        'PM Reserve 2': a.PMR?.[1] || ''
      };
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `PlannedSchedule_${format(new Date(year, month - 1), 'MMM-yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '2em', maxWidth: '600px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <label><strong>Upload Current Points CSV:</strong></label>
      <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ marginBottom: '1em', display: 'block' }} />

      <label><strong>Blocked-Out Dates (Optional):</strong></label>
      <textarea
        rows={6}
        value={blockedText}
        onChange={(e) => setBlockedText(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '1em' }}
        placeholder={`Examples:\nDong Han: 3, 6, 20–22 Aug\nHarshith: 4–9 Aug\nDervin: 02/08/25–10/08/25`}
      />

      <label><strong>Target Month:</strong></label>
      <input
        type="month"
        value={monthYear}
        onChange={(e) => setMonthYear(e.target.value)}
        style={{ marginBottom: '1em', display: 'block' }}
      />

      {!confirmed && (
        <button onClick={parseBlockedDates} style={{ padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none' }}>
          Confirm Blocked Dates
        </button>
      )}

      {confirmed && (
        <div style={{ marginTop: '2em' }}>
          <h2><strong>Parsed Blocked-Out Dates:</strong></h2>
          <ul>
            {Object.entries(blockedParsed || {}).map(([name, dates]) => (
              <li key={name}><strong>{name}</strong>: {dates.map(d => format(new Date(d), 'd MMM')).join(', ')}</li>
            ))}
          </ul>
          <br />
          <button onClick={generateSchedule} style={{ padding: '10px', backgroundColor: 'green', color: 'white', border: 'none', marginRight: '1em' }}>
            Yes, Generate Schedule
          </button>
          <button onClick={() => setConfirmed(false)} style={{ padding: '10px', border: '1px solid #ccc' }}>
            Go Back to Edit
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
