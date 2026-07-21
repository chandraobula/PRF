import { BookOpen, Book, PlayCircle, Trophy, BookMarked, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export default function LearningHub() {
  return (
    <div className="space-y-8 max-w-container-max mx-auto">
      <section>
        <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Learning Hub</h1>
        <p className="font-body text-on-surface-variant text-lg">You've learned for 4 hours this week.</p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <div className="bg-surface-card rounded-card border border-border-subtle p-6">
          <h3 className="font-bold text-lg text-on-surface mb-4">Current Course</h3>
          <div className="flex space-x-4 mb-4">
            <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center shrink-0">
              <PlayCircle className="w-8 h-8 text-on-primary" />
            </div>
            <div>
              <p className="font-semibold text-on-surface">Advanced System Architecture</p>
              <p className="text-sm text-text-muted">Module 4: Distributed Caching</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-text-muted">
              <span>64% completed</span>
              <span>2h 15m remaining</span>
            </div>
            <div className="w-full bg-surface-container h-2 rounded-full">
              <div className="bg-primary h-2 rounded-full" style={{width: '64%'}}></div>
            </div>
            <button className="w-full mt-4 py-2 bg-surface-container-low hover:bg-surface-container border border-border-subtle rounded-lg text-sm font-semibold text-on-surface transition-colors">Continue Learning</button>
          </div>
        </div>

        <div className="bg-ai-electric-blue/5 border-l-4 border-ai-electric-blue rounded-card shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-lg text-on-surface flex items-center mb-2">
              <Sparkles className="w-5 h-5 text-ai-electric-blue mr-2" /> AI Study Path
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">Based on your recent interest in React and System Design, I've generated a 2-week curriculum combining both topics.</p>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-secondary to-ai-electric-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity w-full sm:w-auto self-start">
            View Curriculum
          </button>
        </div>
      </section>

      <section className="bg-surface-card rounded-card border border-border-subtle p-6">
        <h3 className="font-bold text-lg text-on-surface mb-4">Reading List</h3>
        <div className="space-y-3">
          {[
            { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", progress: "Ch 5", icon: Book },
            { title: "The Pragmatic Programmer", author: "Andrew Hunt", progress: "Completed", icon: BookMarked },
            { title: "Refactoring UI", author: "Adam Wathan", progress: "Unread", icon: Book }
          ].map((book, i) => (
            <div key={i} className="flex items-center space-x-4 p-3 hover:bg-surface-container-lowest rounded-lg transition-colors border border-transparent hover:border-border-subtle cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <book.icon className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-on-surface">{book.title}</p>
                <p className="text-xs text-text-muted">{book.author}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${book.progress === 'Completed' ? 'bg-success-proactive/10 text-success-proactive' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {book.progress}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
