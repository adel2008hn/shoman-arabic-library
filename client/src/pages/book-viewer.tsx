import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Book } from "@shared/schema";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { t, getDirection } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowRight, Bookmark, MessageSquare, Send, ThumbsUp, MoreVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BookCard from "@/components/book-card";

function formatYouTubeTime(date: string | Date, lang: string) {
  const diff = new Date().getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 3600);
  const days = Math.floor(hours / 24);

  if (lang === "ar") {
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
  }
  return `${days}d ago`;
}

export default function BookViewerPage() {
  const { language } = useTheme();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const bookId = parseInt(params.id || "0");
  const { toast } = useToast();
  const dir = getDirection(language);
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  const [commentContent, setCommentContent] = useState("");
  const [commentorName, setCommentorName] = useState("");
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());
  const [bookmarkPage, setBookmarkPage] = useState("1");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  // دالة تحديث التعليق سيدي
const updateCommentMutation = useMutation({
  mutationFn: async ({ id, content }: { id: number; content: string }) => {
    return await apiRequest("PATCH", `/api/comments/${id}`, {
      content,
      sessionId: (window as any).currentSessionId
    });
  },
  onSuccess: () => {
    setEditingCommentId(null); // نغلق صندوق التعديل بعد النجاح
    refetchComments(); // نحدث القائمة لتظهر التعديلات فوراً
    toast({ title: language === "ar" ? "تم تحديث التعليق" : "Comment updated" });
  }
});

  // جلب البيانات
  const { data: book, isLoading } = useQuery<Book>({
    queryKey: ["/api/books", bookId],
    enabled: bookId > 0
  });

  const { data: comments = [], refetch: refetchComments } = useQuery<any[]>({
    queryKey: [`/api/comments/${bookId}`],
    enabled: bookId > 0,
  });

  const { data: suggestedBooks = [] } = useQuery<Book[]>({
    queryKey: ["/api/books/suggested", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/suggested`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: bookId > 0,
  });

  const { data: bookmark } = useQuery<{ page: number } | null>({
    queryKey: ["/api/bookmarks", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/bookmarks/${bookId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: bookId > 0,
  });

  const { data: favoriteIds = [] } = useQuery<number[]>({
    queryKey: ["/api/favorites"],
    queryFn: async () => {
      const res = await fetch("/api/favorites");
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (bookmark?.page) setBookmarkPage(String(bookmark.page));
  }, [bookmark]);

  // العمليات (Mutations)
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/comments", {
        bookId,
        content: commentContent,
        authorName: user?.username || commentorName || (language === "ar" ? "زائر" : "Guest"),
        sessionId: (window as any).currentSessionId
      });
    },
    onSuccess: () => {
      setCommentContent("");
      setCommentorName("");
      refetchComments();
      toast({ title: language === "ar" ? "تم إضافة التعليق" : "Comment added" });
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/comments/${id}`, {
        sessionId: (window as any).currentSessionId
      });
    },
    onSuccess: () => {
      refetchComments();
      toast({ title: language === "ar" ? "تم حذف التعليق" : "Comment deleted" });
    }
  });

  const likeMutation = useMutation({
  mutationFn: async (id: number) => {
    // سيدي، نتحقق إذا كان المستخدم قد ضغط لايك مسبقاً أم لا
    const isLiked = likedComments.has(id);
    const action = isLiked ? 'remove' : 'add'; 

    // تحديث الواجهة فوراً ليشعر المستخدم بالسرعة
    setLikedComments(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(id);
      else next.add(id);
      return next;
    });

    return await apiRequest("POST", `/api/comments/${id}/like`, {
      action, // نرسل النوع للسيرفر سيدي
      sessionId: (window as any).currentSessionId
    });
  },
  onSuccess: () => refetchComments()
});

  const saveBookmark = async () => {
    try {
      await apiRequest("POST", `/api/bookmarks/${bookId}`, { page: parseInt(bookmarkPage) || 1 });
      toast({ title: t("bookmark.saved", language) });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks", bookId] });
    } catch {}
  };

  // معالجة حالات التحميل وعدم وجود الكتاب في البداية لتجنب أخطاء Undefined
  if (isLoading) return <div className="flex justify-center p-20 animate-pulse">Loading...</div>;
  if (!book) return <div className="text-center p-20">Book not found</div>;

  const embedUrl = book.fileUrl?.includes("drive.google.com") 
    ? book.fileUrl.replace("/view", "/preview") 
    : book.fileUrl;

  const defaultCover = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" fill="#1a2744"><rect width="300" height="400" fill="#e8e0d0"/><text x="150" y="200" text-anchor="middle" fill="#1a2744" font-size="60">📖</text></svg>`)}`;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      {/* Header */}
      <div className="bg-[#1a2744] dark:bg-[#0d1525] py-4 px-4 text-white">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate("/")}>
            <BackArrow className="w-4 h-4 me-2" /> {t("back", language)}
          </Button>
          <span className="font-medium truncate">{book.title}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-8">
              <img src={book.coverUrl || defaultCover} className="w-full rounded-lg mb-4 shadow-md" alt={book.title} />
              <h1 className="text-xl font-bold mb-2">{book.title}</h1>
              <p className="text-sm text-muted-foreground mb-4">{t("book.author", language)}: {book.authorName}</p>
              <div className="flex gap-2 mb-4">
                <Badge className="bg-[#d4a843]">{book.mainCategory}</Badge>
                <Badge variant="outline">{book.subCategory}</Badge>
              </div>
              {book.description && <p className="text-sm text-muted-foreground leading-relaxed mb-6">{book.description}</p>}
              
              <div className="border-t pt-4">
                <label className="text-sm font-medium mb-2 block">{t("bookmark.page", language)}</label>
                <div className="flex gap-2">
                  <Input type="number" value={bookmarkPage} onChange={(e) => setBookmarkPage(e.target.value)} />
                  <Button className="bg-[#d4a843]" onClick={saveBookmark}><Bookmark className="w-4 h-4" /></Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="overflow-hidden border-2 border-[#1a2744]/10 shadow-xl">
              {embedUrl ? (
                <iframe src={embedUrl} className="w-full h-[80vh] border-0" allow="autoplay" title="PDF Viewer" />
              ) : (
                <div className="h-[50vh] flex items-center justify-center italic text-muted-foreground">No Preview Available</div>
              )}
            </Card>
          </div>
        </div>

        {/* الكتب المقترحة */}
        {suggestedBooks.length > 0 && (
          <div className="mt-16 mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t("suggested", language)}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {suggestedBooks.map((sb) => (
                <BookCard
                  key={sb.id}
                  book={sb}
                  isFavorite={favoriteIds.includes(sb.id)}
                  onToggleFavorite={() => {}}
                  language={language}
                />
              ))}
            </div>
          </div>
        )}

        {/* التعليقات */}
        <div className="mt-12 border-t pt-8">
          <div className="flex items-center gap-2 mb-8">
            <MessageSquare className="w-6 h-6 text-[#d4a843]" />
            <h2 className="text-2xl font-bold text-foreground">
              {language === "ar" ? "التعليقات" : "Comments"}
            </h2>
          </div>

          <Card className="p-4 mb-8">
            <div className="flex flex-col sm:flex-row gap-3">
              {!user && (
                <Input 
                  placeholder={language === "ar" ? "اسمك" : "Name"} 
                  className="sm:w-32" 
                  value={commentorName} 
                  onChange={e => setCommentorName(e.target.value)} 
                />
              )}
              <Input 
                placeholder={language === "ar" ? "اكتب تعليقك..." : "Comment..."} 
                className="flex-1" 
                value={commentContent} 
                onChange={e => setCommentContent(e.target.value)} 
              />
              <Button 
                className="bg-[#d4a843]" 
                onClick={() => addCommentMutation.mutate()} 
                disabled={addCommentMutation.isPending || !commentContent.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>

          <div className="space-y-4 pb-20">
           {comments.map((comment: any) => {
  const isOwner = comment.sessionId === (window as any).currentSessionId;
  const isAdmin = user?.role === "admin";
  const isEditing = editingCommentId === comment.id;

  return (
    <Card key={comment.id} className="p-4 border-r-4 border-r-[#d4a843]">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-[#d4a843]">{comment.authorName}</span>
            <span className="text-[10px] text-muted-foreground">{formatYouTubeTime(comment.createdAt, language)}</span>
          </div>
          
          {/* سيدي، هنا يتم التبديل بين النص أو حقل التعديل */}
          {isEditing ? (
            <div className="space-y-2 mt-2">
              <Input 
                value={editContent} 
                onChange={(e) => setEditContent(e.target.value)}
                className="focus-visible:ring-[#d4a843] h-9"
                autoFocus
              />
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  className="bg-[#d4a843] h-7 text-xs text-white hover:bg-[#b88f35]" 
                  onClick={() => updateCommentMutation.mutate({ id: comment.id, content: editContent })}
                  disabled={updateCommentMutation.isPending}
                >
                  {language === "ar" ? "حفظ" : "Save"}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 text-xs" 
                  onClick={() => setEditingCommentId(null)}
                >
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm">{comment.content}</p>
          )}
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => likeMutation.mutate(comment.id)} className={likedComments.has(comment.id) ? "text-[#d4a843]" : ""}>
            <ThumbsUp className={`w-4 h-4 me-1 ${likedComments.has(comment.id) ? "fill-current" : ""}`} /> {comment.likes}
          </Button>
          
          {(isOwner || isAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && (
                  <DropdownMenuItem 
                    onClick={() => { 
                      setEditingCommentId(comment.id); 
                      setEditContent(comment.content); 
                    }}
                    className="cursor-pointer"
                  >
                    {language === "ar" ? "تعديل" : "Edit"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  className="text-red-600 cursor-pointer" 
                  onClick={() => {
                    if(confirm(language === "ar" ? "هل أنت متأكد؟" : "Are you sure?")) {
                      deleteCommentMutation.mutate(comment.id);
                    }
                  }}
                >
                  {language === "ar" ? "حذف" : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </Card>
  );
})}
          </div>
        </div>
      </div>
    </div>
  );
}