export default defineNuxtPlugin(() => {
  const styleId = 'sst-dark-tables-runtime'

  if (document.getElementById(styleId)) {
    return
  }

  const style = document.createElement('style')
  style.id = styleId

  style.textContent = `
    /* School Sports Tracker - force all application tables dark */
    table.sst-dark-table {
      width: 100%;
      background: #081525 !important;
      color: #e2e8f0 !important;
      border-color: #1e3a55 !important;
    }

    table.sst-dark-table thead,
    table.sst-dark-table thead tr,
    table.sst-dark-table thead th {
      background: #0b1a2d !important;
      background-color: #0b1a2d !important;
      color: #cbd5e1 !important;
      border-color: #1e3a55 !important;
    }

    table.sst-dark-table tbody,
    table.sst-dark-table tbody tr,
    table.sst-dark-table tbody td {
      background: #081525 !important;
      background-color: #081525 !important;
      color: #e2e8f0 !important;
      border-color: #172b40 !important;
    }

    table.sst-dark-table tbody tr:nth-child(even),
    table.sst-dark-table tbody tr:nth-child(even) td {
      background: #09182a !important;
      background-color: #09182a !important;
    }

    table.sst-dark-table tbody tr:hover,
    table.sst-dark-table tbody tr:hover td {
      background: #10243a !important;
      background-color: #10243a !important;
    }

    table.sst-dark-table th,
    table.sst-dark-table td {
      border-color: #172b40 !important;
    }

    table.sst-dark-table .text-slate-900,
    table.sst-dark-table .text-slate-800,
    table.sst-dark-table .text-slate-700,
    table.sst-dark-table .text-slate-600,
    table.sst-dark-table .text-gray-900,
    table.sst-dark-table .text-gray-800,
    table.sst-dark-table .text-gray-700,
    table.sst-dark-table .text-gray-600 {
      color: #e2e8f0 !important;
    }

    table.sst-dark-table .text-slate-500,
    table.sst-dark-table .text-slate-400,
    table.sst-dark-table .text-gray-500,
    table.sst-dark-table .text-gray-400 {
      color: #94a3b8 !important;
    }

    table.sst-dark-table input,
    table.sst-dark-table select,
    table.sst-dark-table textarea {
      background: #06111f !important;
      background-color: #06111f !important;
      color: #f8fafc !important;
      border-color: #29435d !important;
    }

    table.sst-dark-table .bg-white,
    table.sst-dark-table .bg-slate-50,
    table.sst-dark-table .bg-slate-100,
    table.sst-dark-table .bg-gray-50,
    table.sst-dark-table .bg-gray-100 {
      background: #081525 !important;
      background-color: #081525 !important;
    }

    table.sst-dark-table .bg-blue-50,
    table.sst-dark-table .bg-blue-100 {
      background: rgba(37, 99, 235, .17) !important;
    }

    table.sst-dark-table .bg-green-50,
    table.sst-dark-table .bg-green-100,
    table.sst-dark-table .bg-emerald-50,
    table.sst-dark-table .bg-emerald-100 {
      background: rgba(34, 197, 94, .15) !important;
    }

    table.sst-dark-table .bg-red-50,
    table.sst-dark-table .bg-red-100 {
      background: rgba(239, 68, 68, .15) !important;
    }

    table.sst-dark-table .bg-amber-50,
    table.sst-dark-table .bg-amber-100,
    table.sst-dark-table .bg-yellow-50,
    table.sst-dark-table .bg-yellow-100 {
      background: rgba(245, 158, 11, .15) !important;
    }

    /* Make common table wrappers dark as well */
    .sst-dark-table {
      border-color: #1e3a55 !important;
    }

    div:has(> table.sst-dark-table),
    section:has(> table.sst-dark-table),
    div:has(> .overflow-x-auto > table.sst-dark-table),
    section:has(> .overflow-x-auto > table.sst-dark-table) {
      background: #081525 !important;
      background-color: #081525 !important;
      border-color: #1e3a55 !important;
      color: #f8fafc !important;
    }
  `

  document.head.appendChild(style)
})
