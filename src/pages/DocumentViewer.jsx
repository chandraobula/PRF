import { FileText, Download, Share2, Folder, Search, Sparkles } from 'lucide-react';

export default function DocumentViewer() {
  return (
    <div className="space-y-8 max-w-container-max mx-auto">
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Documents</h1>
          <p className="font-body text-on-surface-variant text-lg">Secure vault and file management.</p>
        </div>
        <div className="flex relative w-full md:w-64">
          <input 
            type="text" 
            placeholder="Search documents..." 
            className="w-full bg-surface-card border border-border-subtle rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {['Tax Returns', 'Contracts', 'Personal', 'Archives'].map((folder, i) => (
          <div key={i} className="p-4 bg-surface-container-lowest border border-border-subtle rounded-lg flex flex-col items-center justify-center space-y-2 cursor-pointer hover:bg-surface-container-low transition-colors">
            <Folder className="w-8 h-8 text-primary/60" />
            <span className="text-sm font-semibold text-on-surface">{folder}</span>
          </div>
        ))}
      </section>

      <section className="bg-surface-card rounded-card border border-border-subtle overflow-hidden">
        <div className="p-4 border-b border-border-subtle bg-surface-container-low flex justify-between items-center">
          <h3 className="font-bold text-sm text-on-surface">Recent Files</h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {[
            { name: "2023_Tax_Return_Final.pdf", date: "Oct 12, 2023", size: "2.4 MB" },
            { name: "Employment_Agreement.docx", date: "Sep 28, 2023", size: "1.1 MB" },
            { name: "Apartment_Lease_Signed.pdf", date: "Aug 01, 2023", size: "3.8 MB" }
          ].map((file, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-surface-container-lowest transition-colors gap-4 sm:gap-0">
              <div className="flex items-center space-x-3 overflow-hidden min-w-0">
                <FileText className="w-5 h-5 text-text-muted flex-shrink-0" />
                <div className="truncate min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{file.name}</p>
                  <p className="text-xs text-text-muted">{file.date} · {file.size}</p>
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <button className="p-2 text-text-muted hover:text-primary hover:bg-surface-container-low rounded-md transition-colors"><Download className="w-4 h-4" /></button>
                <button className="p-2 text-text-muted hover:text-primary hover:bg-surface-container-low rounded-md transition-colors"><Share2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
