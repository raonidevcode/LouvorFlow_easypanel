import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NoteName, parseChordSheet, Repertoire, Song, SongSection, transposeSong } from "../../../packages/shared/src";
import "./styles.css";

type ViewName = "search" | "song" | "library" | "repertoires" | "repertoireDetail" | "repertoireLive" | "editor" | "repertoireEditor" | "account";
type SyncVersion = {
  version: string;
};
type TopArtist = {
  name: string;
  songCount: number;
};
type SongPageResponse = {
  items: Song[];
  nextCursor: string | null;
};
type RepertoirePageResponse = {
  items: Repertoire[];
  nextCursor: string | null;
};
type LibraryPageState = {
  query: string;
  loadedQuery: string;
  songs: Song[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadError: boolean;
  syncedSongCount: number;
};
type RepertoirePeriod = "upcoming" | "past";
type RepertoirePageBucket = {
  items: Repertoire[];
  cursor: string | null;
  loadedQuery: string;
  loading: boolean;
  loadingMore: boolean;
  loadError: boolean;
  syncedRepertoireKey: string;
};
type RepertoirePageState = {
  query: string;
  period: RepertoirePeriod;
  upcoming: RepertoirePageBucket;
  past: RepertoirePageBucket;
};
type WorkspaceRole = "master" | "member" | "viewer";
type PermissionState = "checking" | "allowed" | "denied";
type AuthSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
    isAppMaster?: boolean;
  };
  workspace: {
    id: string;
    name: string;
    role: WorkspaceRole;
  };
  expiresAt?: string;
};
type WorkspaceUserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  isAppMaster?: boolean;
  isActive?: boolean;
};
type StoredNavigation = {
  view: ViewName;
  selectedSongId?: string;
  selectedRepertoireId?: string;
  currentKey?: NoteName;
};

var NATURAL_KEYS: NoteName[] = ["C", "D", "E", "F", "G", "A", "B"];
var FLAT_KEYS: NoteName[] = ["Db", "Eb", "Gb", "Ab", "Bb"];
var SHARP_KEYS: NoteName[] = ["C#", "D#", "F#", "G#", "A#"];
var API_BASE_URL = readApiBaseUrl();
var NAVIGATION_STORAGE_KEY = "louvorflow.navigation.v1";
var AUTH_SESSION_STORAGE_KEY = "louvorflow.authSession.v1";
var SYNC_POLL_INTERVAL_MS = 15000;
var SYNC_SOCKET_RECONNECT_MS = 5000;
var LIBRARY_INITIAL_PAGE_SIZE = 15;
var LIBRARY_NEXT_PAGE_SIZE = 10;
var REPERTOIRE_INITIAL_PAGE_SIZE = 15;
var REPERTOIRE_NEXT_PAGE_SIZE = 10;

function normalizeClientRole(role: string | undefined): WorkspaceRole {
  var normalized = String(role || "").toLowerCase();
  if (normalized === "master" || normalized === "owner" || normalized === "admin") {
    return "master";
  }

  if (normalized === "viewer" || normalized === "view") {
    return "viewer";
  }

  return "member";
}

function canManageSongs(session: AuthSession | null) {
  return Boolean(session?.user.isAppMaster);
}

function canManageRepertoires(session: AuthSession | null) {
  var role = normalizeClientRole(session?.workspace.role);
  return role === "master" || role === "member";
}

function isSameAuthScope(current: AuthSession | null, next: AuthSession) {
  return Boolean(
    current &&
    current.user.id === next.user.id &&
    current.user.isAppMaster === next.user.isAppMaster &&
    current.workspace.id === next.workspace.id &&
    current.workspace.role === next.workspace.role
  );
}

function readCachedAuthSession(): AuthSession | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }

  try {
    var rawSession = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!rawSession) {
      return null;
    }

    var session = JSON.parse(rawSession) as AuthSession;
    if (!session || !session.user || !session.workspace || !session.user.id || !session.workspace.id) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function writeCachedAuthSession(session: AuthSession) {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can fail in older/private browsers; the server session remains authoritative.
  }
}

function clearCachedAuthSession() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function PasswordEyeIcon(props: { isVisible: boolean }) {
  if (props.isVisible) {
    return (
      <svg className="passwordEyeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.5 5.2A9.2 9.2 0 0 1 12 4.8c5 0 8.7 4.5 9.8 6.1.3.4.3 1 0 1.4-.5.8-1.7 2.2-3.4 3.5" />
        <path d="M6.2 6.7c-2 1.3-3.4 3.1-4 4.2-.3.4-.3 1 0 1.4 1.1 1.6 4.8 6.1 9.8 6.1 1.5 0 2.8-.4 4-1" />
      </svg>
    );
  }

  return (
    <svg className="passwordEyeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.2 12.3c-.3-.4-.3-1 0-1.4C3.3 9.3 7 4.8 12 4.8s8.7 4.5 9.8 6.1c.3.4.3 1 0 1.4-1.1 1.6-4.8 6.1-9.8 6.1s-8.7-4.5-9.8-6.1Z" />
      <circle cx="12" cy="11.6" r="2.6" />
    </svg>
  );
}

function createRepertoirePageBucket(): RepertoirePageBucket {
  return {
    items: [],
    cursor: null,
    loadedQuery: "",
    loading: true,
    loadingMore: false,
    loadError: false,
    syncedRepertoireKey: ""
  };
}

function createRepertoirePageState(): RepertoirePageState {
  return {
    query: "",
    period: "upcoming",
    upcoming: createRepertoirePageBucket(),
    past: createRepertoirePageBucket()
  };
}

function App() {
  var isLegacyReadOnly = shouldUseLegacyReadOnlyMode();
  var initialNavigation = readInitialNavigation(isLegacyReadOnly);
  var initialSongId = readInitialSongId();
  var initialSelectedSongId = initialNavigation.selectedSongId || initialSongId;
  var _view = useState<ViewName>(initialNavigation.view);
  var view = _view[0];
  var setView = _view[1];
  var viewRef = useRef(view);
  var _songs = useState<Song[]>([]);
  var songs = _songs[0];
  var setSongs = _songs[1];
  var _songsLoading = useState(true);
  var songsLoading = _songsLoading[0];
  var setSongsLoading = _songsLoading[1];
  var _songsLoadError = useState(false);
  var songsLoadError = _songsLoadError[0];
  var setSongsLoadError = _songsLoadError[1];
  var _libraryPage = useState<LibraryPageState>({
    query: "",
    loadedQuery: "",
    songs: [],
    cursor: null,
    loading: true,
    loadingMore: false,
    loadError: false,
    syncedSongCount: 0
  });
  var libraryPage = _libraryPage[0];
  var setLibraryPage = _libraryPage[1];
  var _popularSongs = useState<Song[]>([]);
  var popularSongs = _popularSongs[0];
  var setPopularSongs = _popularSongs[1];
  var _popularSongsLoading = useState(true);
  var popularSongsLoading = _popularSongsLoading[0];
  var setPopularSongsLoading = _popularSongsLoading[1];
  var _topArtists = useState<TopArtist[]>([]);
  var topArtists = _topArtists[0];
  var setTopArtists = _topArtists[1];
  var _topArtistsLoading = useState(true);
  var topArtistsLoading = _topArtistsLoading[0];
  var setTopArtistsLoading = _topArtistsLoading[1];
  var _repertoires = useState<Repertoire[]>([]);
  var repertoires = _repertoires[0];
  var setRepertoires = _repertoires[1];
  var _repertoiresLoading = useState(true);
  var repertoiresLoading = _repertoiresLoading[0];
  var setRepertoiresLoading = _repertoiresLoading[1];
  var _repertoiresLoadError = useState(false);
  var repertoiresLoadError = _repertoiresLoadError[0];
  var setRepertoiresLoadError = _repertoiresLoadError[1];
  var _repertoirePage = useState<RepertoirePageState>(createRepertoirePageState());
  var repertoirePage = _repertoirePage[0];
  var setRepertoirePage = _repertoirePage[1];
  var _selectedSongId = useState(initialSelectedSongId);
  var selectedSongId = _selectedSongId[0];
  var setSelectedSongId = _selectedSongId[1];
  var _editingSongId = useState("");
  var editingSongId = _editingSongId[0];
  var setEditingSongId = _editingSongId[1];
  var _selectedRepertoireId = useState(initialNavigation.selectedRepertoireId || "");
  var selectedRepertoireId = _selectedRepertoireId[0];
  var setSelectedRepertoireId = _selectedRepertoireId[1];
  var _addingToRepertoireId = useState("");
  var addingToRepertoireId = _addingToRepertoireId[0];
  var setAddingToRepertoireId = _addingToRepertoireId[1];
  var _pendingRepertoireSongId = useState("");
  var pendingRepertoireSongId = _pendingRepertoireSongId[0];
  var setPendingRepertoireSongId = _pendingRepertoireSongId[1];
  var _songToDelete = useState<Song | null>(null);
  var songToDelete = _songToDelete[0];
  var setSongToDelete = _songToDelete[1];
  var _repertoireToDelete = useState<Repertoire | null>(null);
  var repertoireToDelete = _repertoireToDelete[0];
  var setRepertoireToDelete = _repertoireToDelete[1];
  var _currentKey = useState<NoteName>(initialNavigation.currentKey || "D");
  var currentKey = _currentKey[0];
  var setCurrentKey = _currentKey[1];
  var syncVersionRef = useRef("");
  var isRefreshingRef = useRef(false);
  var dataLoadVersionRef = useRef(0);
  var syncSocketConnectedRef = useRef(false);
  var syncSocketRef = useRef<WebSocket | null>(null);
  var selectedSongIdRef = useRef(selectedSongId);
  var isAppMasterRef = useRef(false);
  var initialAuthSession = useMemo(readCachedAuthSession, []);
  var _authSession = useState<AuthSession | null>(initialAuthSession);
  var authSession = _authSession[0];
  var setAuthSession = _authSession[1];
  var _authChecked = useState(false);
  var authChecked = _authChecked[0];
  var setAuthChecked = _authChecked[1];
  var _authNotice = useState("");
  var authNotice = _authNotice[0];
  var setAuthNotice = _authNotice[1];
  var _workspaceUsers = useState<WorkspaceUserSummary[]>([]);
  var workspaceUsers = _workspaceUsers[0];
  var setWorkspaceUsers = _workspaceUsers[1];
  var _workspaceUsersLoading = useState(false);
  var workspaceUsersLoading = _workspaceUsersLoading[0];
  var setWorkspaceUsersLoading = _workspaceUsersLoading[1];
  var _workspaceUsersLoadError = useState(false);
  var workspaceUsersLoadError = _workspaceUsersLoadError[0];
  var setWorkspaceUsersLoadError = _workspaceUsersLoadError[1];
  var _workspaceUsersLoaded = useState(false);
  var workspaceUsersLoaded = _workspaceUsersLoaded[0];
  var setWorkspaceUsersLoaded = _workspaceUsersLoaded[1];

  useEffect(function () {
    apiRequest<AuthSession>("GET", "/auth/me").then(function (session) {
      if (initialAuthSession && !isSameAuthScope(initialAuthSession, session)) {
        clearSessionScopedState();
      }
      writeCachedAuthSession(session);
      setAuthSession(session);
    }).catch(function () {
      clearCachedAuthSession();
      setAuthSession(null);
    }).then(function () {
      setAuthChecked(true);
    });
  }, []);

  useEffect(function () {
    if (!isLegacyReadOnly) {
      return;
    }

    document.documentElement.classList.add("legacyVisualRoot");
    document.body.classList.add("legacyVisualRoot");

    return function () {
      document.documentElement.classList.remove("legacyVisualRoot");
      document.body.classList.remove("legacyVisualRoot");
    };
  }, [isLegacyReadOnly]);

  useEffect(function () {
    selectedSongIdRef.current = selectedSongId;
  }, [selectedSongId]);

  useEffect(function () {
    viewRef.current = view;
  }, [view]);

  useEffect(function () {
    isAppMasterRef.current = Boolean(authSession?.user.isAppMaster);
  }, [authSession?.user.isAppMaster]);

  useEffect(function () {
    if (!authChecked || view !== "account") {
      return;
    }

    if (!authSession?.user.isAppMaster || isLegacyReadOnly) {
      setWorkspaceUsers([]);
      setWorkspaceUsersLoading(false);
      setWorkspaceUsersLoadError(false);
      setWorkspaceUsersLoaded(false);
      return;
    }

    if (!workspaceUsersLoaded && !workspaceUsersLoading) {
      refreshWorkspaceUsers(true);
    }
  }, [authChecked, authSession?.user.id, authSession?.user.isAppMaster, isLegacyReadOnly, view, workspaceUsersLoaded, workspaceUsersLoading]);

  useEffect(function () {
    writeStoredNavigation({
      view: view,
      selectedSongId: selectedSongId,
      selectedRepertoireId: selectedRepertoireId,
      currentKey: currentKey
    });
  }, [view, selectedSongId, selectedRepertoireId, currentKey]);

  function applySongsFromApi(apiSongs: Song[], shouldUpdateSelection: boolean) {
    setSongs(apiSongs);

    if (!apiSongs.length) {
      setSelectedSongId("");
      return;
    }

    var currentSelectedSongId = selectedSongIdRef.current;
    var selectedExists = apiSongs.some(function (song) {
      return song.id === currentSelectedSongId;
    });

    if (!currentSelectedSongId || !selectedExists) {
      setSelectedSongId(apiSongs[0].id);
      setCurrentKey(apiSongs[0].currentKey);
      return;
    }

    if (shouldUpdateSelection) {
      var selectedApiSong = apiSongs.filter(function (song) {
        return song.id === currentSelectedSongId;
      })[0];

      if (selectedApiSong) {
        setCurrentKey(selectedApiSong.currentKey);
      }
    }
  }

  function refreshSongs(shouldUpdateSelection: boolean, isInitialLoad?: boolean, dataLoadVersion?: number) {
    return apiRequest<Song[]>("GET", "/songs").then(function (apiSongs) {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      applySongsFromApi(apiSongs, shouldUpdateSelection);
      if (isInitialLoad) {
        setSongsLoadError(false);
      }
    }).catch(function (error) {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      console.warn("Nao foi possivel carregar musicas da API.", error);
      if (isInitialLoad) {
        setSongsLoadError(true);
      }
    }).then(function () {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      if (isInitialLoad) {
        setSongsLoading(false);
      }
    });
  }

  function refreshRepertoires(isInitialLoad?: boolean, dataLoadVersion?: number) {
    return apiRequest<Repertoire[]>("GET", "/repertoires").then(function (apiRepertoires) {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      setRepertoires(apiRepertoires);
      if (isInitialLoad) {
        setRepertoiresLoadError(false);
      }
    }).catch(function (error) {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      console.warn("Nao foi possivel carregar repertorios da API.", error);
      if (isInitialLoad) {
        setRepertoiresLoadError(true);
      }
    }).then(function () {
      if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
        return;
      }

      if (isInitialLoad) {
        setRepertoiresLoading(false);
      }
    });
  }

  function refreshSearchStats(isInitialLoad?: boolean, dataLoadVersion?: number) {
    if (isInitialLoad) {
      setPopularSongsLoading(true);
      setTopArtistsLoading(true);
    }

    return Promise.all([
      apiRequest<Song[]>("GET", "/songs/popular?limit=200").then(function (apiSongs) {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        setPopularSongs(apiSongs);
      }).catch(function (error) {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        console.warn("Nao foi possivel carregar musicas favoritas.", error);
        setPopularSongs([]);
      }).then(function () {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        if (isInitialLoad) {
          setPopularSongsLoading(false);
        }
      }),
      apiRequest<TopArtist[]>("GET", "/songs/top-artists?limit=200").then(function (apiArtists) {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        setTopArtists(apiArtists);
      }).catch(function (error) {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        console.warn("Nao foi possivel carregar top artistas.", error);
        setTopArtists([]);
      }).then(function () {
        if (typeof dataLoadVersion === "number" && dataLoadVersion !== dataLoadVersionRef.current) {
          return;
        }

        if (isInitialLoad) {
          setTopArtistsLoading(false);
        }
      })
    ]);
  }

  function refreshAppData(shouldUpdateSelection: boolean, isInitialLoad?: boolean, forceRefresh?: boolean) {
    if (isRefreshingRef.current && !forceRefresh) {
      return Promise.resolve();
    }

    var dataLoadVersion = dataLoadVersionRef.current;
    isRefreshingRef.current = true;
    return Promise.all([refreshSongs(shouldUpdateSelection, isInitialLoad, dataLoadVersion), refreshRepertoires(isInitialLoad, dataLoadVersion), refreshSearchStats(isInitialLoad, dataLoadVersion)]).then(function () {
      isRefreshingRef.current = false;
    }).catch(function () {
      isRefreshingRef.current = false;
    });
  }

  function refreshSyncVersion() {
    return apiRequest<SyncVersion>("GET", "/sync/version").then(function (syncVersion) {
      syncVersionRef.current = syncVersion.version;
    }).catch(function (error) {
      console.warn("Nao foi possivel carregar a versao de sincronizacao.", error);
    });
  }

  function refreshWorkspaceUsers(force?: boolean) {
    if (!authSession?.user.isAppMaster || isLegacyReadOnly) {
      setWorkspaceUsers([]);
      setWorkspaceUsersLoading(false);
      setWorkspaceUsersLoadError(false);
      setWorkspaceUsersLoaded(false);
      return Promise.resolve();
    }

    if (!force && workspaceUsersLoaded && !workspaceUsersLoadError) {
      return Promise.resolve();
    }

    setWorkspaceUsersLoading(true);
    setWorkspaceUsersLoadError(false);

    return apiRequest<WorkspaceUserSummary[]>("GET", "/users").then(function (users) {
      setWorkspaceUsers(users);
      setWorkspaceUsersLoaded(true);
    }).catch(function (error) {
      if (isAuthError(error)) {
        handleAuthExpired();
        return;
      }

      console.warn("Nao foi possivel carregar os usuarios.", error);
      setWorkspaceUsersLoadError(true);
    }).then(function () {
      setWorkspaceUsersLoading(false);
    });
  }

  function refreshFromSyncEvent() {
    refreshAppData(false).then(function () {
      refreshSyncVersion();
    });
  }

  function clearSessionScopedState() {
    dataLoadVersionRef.current += 1;
    setRepertoires([]);
    setWorkspaceUsers([]);
    setWorkspaceUsersLoading(false);
    setWorkspaceUsersLoadError(false);
    setWorkspaceUsersLoaded(false);
    setSelectedRepertoireId("");
    setAddingToRepertoireId("");
    setPendingRepertoireSongId("");
    setEditingSongId("");
    setSongToDelete(null);
    setRepertoireToDelete(null);
    setSongsLoading(true);
    setRepertoiresLoading(true);
    setSongsLoadError(false);
    setRepertoiresLoadError(false);
    syncVersionRef.current = "";
  }

  useEffect(function () {
    refreshAppData(true, true).then(function () {
      refreshSyncVersion();
    });
  }, []);

  useEffect(function () {
    var disposed = false;

    function checkForUpdates() {
      if (syncSocketConnectedRef.current) {
        return;
      }

      apiRequest<SyncVersion>("GET", "/sync/version").then(function (syncVersion) {
        if (disposed) {
          return;
        }

        if (!syncVersionRef.current) {
          syncVersionRef.current = syncVersion.version;
          return;
        }

        if (syncVersion.version !== syncVersionRef.current) {
          syncVersionRef.current = syncVersion.version;
          refreshAppData(false);
        }
      }).catch(function (error) {
        console.warn("Nao foi possivel verificar atualizacoes.", error);
      });
    }

    var intervalId = window.setInterval(checkForUpdates, SYNC_POLL_INTERVAL_MS);

    return function () {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(function () {
    if (isLegacyReadOnly || typeof window === "undefined" || !("WebSocket" in window)) {
      return;
    }

    var disposed = false;
    var reconnectId = 0;

    function connectSyncSocket() {
      if (disposed) {
        return;
      }

      var socket = new WebSocket(readSyncSocketUrl());
      syncSocketRef.current = socket;

      socket.onopen = function () {
        syncSocketConnectedRef.current = true;
      };

      socket.onmessage = function (event) {
        try {
          var syncEvent = JSON.parse(event.data);

          if (syncEvent.type === "users:changed") {
            setWorkspaceUsersLoaded(false);

            if (isAppMasterRef.current && viewRef.current === "account") {
              refreshWorkspaceUsers(true);
            }

            return;
          }

          if (syncEvent.type === "songs:changed" || syncEvent.type === "repertoires:changed" || syncEvent.type === "sync:changed") {
            refreshFromSyncEvent();
          }
        } catch (error) {
          console.warn("Nao foi possivel processar evento de sincronizacao.", error);
        }
      };

      socket.onerror = function () {
        syncSocketConnectedRef.current = false;
      };

      socket.onclose = function () {
        syncSocketConnectedRef.current = false;

        if (!disposed) {
          reconnectId = window.setTimeout(connectSyncSocket, SYNC_SOCKET_RECONNECT_MS);
        }
      };
    }

    connectSyncSocket();

    return function () {
      disposed = true;
      syncSocketConnectedRef.current = false;
      window.clearTimeout(reconnectId);

      if (syncSocketRef.current) {
        syncSocketRef.current.close();
      }
    };
  }, [isLegacyReadOnly]);

  var selectedSong = useMemo(function () {
    var song = songs.filter(function (item) {
      return item.id === selectedSongId;
    })[0] || songs[0] || null;

    return song ? transposeSong(song, currentKey) : null;
  }, [songs, selectedSongId, currentKey]);
  var selectedRepertoire = useMemo(function () {
    return repertoires.filter(function (repertoire) {
      return repertoire.id === selectedRepertoireId;
    })[0] || repertoires[0] || null;
  }, [repertoires, selectedRepertoireId]);
  var addingToRepertoire = useMemo(function () {
    return repertoires.filter(function (repertoire) {
      return repertoire.id === addingToRepertoireId;
    })[0] || null;
  }, [repertoires, addingToRepertoireId]);
  var pendingRepertoireSong = useMemo(function () {
    return songs.filter(function (song) {
      return song.id === pendingRepertoireSongId;
    })[0] || null;
  }, [songs, pendingRepertoireSongId]);

  function openSong(song: Song) {
    setSelectedSongId(song.id);
    setCurrentKey(song.currentKey);
    setView("song");
  }

  function editSong(song: Song) {
    setEditingSongId(song.id);
    setSelectedSongId(song.id);
    setCurrentKey(song.currentKey);
    setView("editor");
  }

  function createSong() {
    setEditingSongId("");
    setView("editor");
  }

  function createRepertoire() {
    setView("repertoireEditor");
  }

  function startAddSongFlow(song: Song) {
    setPendingRepertoireSongId(song.id);
    setAddingToRepertoireId("");
    setView("repertoires");
  }

  function openRepertoire(repertoire: Repertoire) {
    setSelectedRepertoireId(repertoire.id);
    setView("repertoireDetail");
  }

  function openRepertoireLive(repertoire: Repertoire) {
    setSelectedRepertoireId(repertoire.id);
    setView("repertoireLive");
  }

  function startAddingSongsToRepertoire(repertoire: Repertoire) {
    setSelectedRepertoireId(repertoire.id);
    setAddingToRepertoireId(repertoire.id);
    setView("library");
  }

  function updateRepertoire(repertoireToUpdate: Repertoire) {
    setRepertoires(function (currentRepertoires) {
      return currentRepertoires.map(function (repertoire) {
        return repertoire.id === repertoireToUpdate.id ? repertoireToUpdate : repertoire;
      });
    });
    setSelectedRepertoireId(repertoireToUpdate.id);

    apiRequest<Repertoire>("PUT", "/repertoires/" + encodeURIComponent(repertoireToUpdate.id), repertoireToUpdate).catch(function (error) {
      handleWriteError("Nao foi possivel atualizar o repertorio na API.", error);
    });
  }

  function stopAddingSongsToRepertoire() {
    if (addingToRepertoireId) {
      setSelectedRepertoireId(addingToRepertoireId);
    }

    setAddingToRepertoireId("");
    setView("repertoireDetail");
  }

  function addSongToRepertoire(song: Song) {
    if (!addingToRepertoire) {
      return;
    }

    var alreadyAdded = addingToRepertoire.songs.some(function (item) {
      return item.songId === song.id;
    });

    if (alreadyAdded) {
      return;
    }

    var updatedRepertoire: Repertoire = {
      ...addingToRepertoire,
      songs: addingToRepertoire.songs.concat({
        songId: song.id,
        order: addingToRepertoire.songs.length + 1,
        key: song.currentKey,
        capo: 0,
        note: ""
      })
    };

    setRepertoires(function (currentRepertoires) {
      return currentRepertoires.map(function (repertoire) {
        return repertoire.id === updatedRepertoire.id ? updatedRepertoire : repertoire;
      });
    });
    setSelectedRepertoireId(updatedRepertoire.id);

    apiRequest<Repertoire>("PUT", "/repertoires/" + encodeURIComponent(updatedRepertoire.id), updatedRepertoire).catch(function (error) {
      handleWriteError("Nao foi possivel adicionar a musica ao repertorio na API.", error);
    });
  }

  function addPendingSongToRepertoire(repertoire: Repertoire) {
    if (!pendingRepertoireSong) {
      openRepertoire(repertoire);
      return;
    }

    var alreadyAdded = repertoire.songs.some(function (item) {
      return item.songId === pendingRepertoireSong.id;
    });
    var updatedRepertoire: Repertoire = alreadyAdded ? repertoire : {
      ...repertoire,
      songs: repertoire.songs.concat({
        songId: pendingRepertoireSong.id,
        order: repertoire.songs.length + 1,
        key: pendingRepertoireSong.currentKey,
        capo: 0,
        note: ""
      })
    };

    if (!alreadyAdded) {
      setRepertoires(function (currentRepertoires) {
        return currentRepertoires.map(function (item) {
          return item.id === updatedRepertoire.id ? updatedRepertoire : item;
        });
      });

      apiRequest<Repertoire>("PUT", "/repertoires/" + encodeURIComponent(updatedRepertoire.id), updatedRepertoire).catch(function (error) {
        handleWriteError("Nao foi possivel adicionar a musica ao repertorio na API.", error);
      });
    }

    setPendingRepertoireSongId("");
    setSelectedRepertoireId(updatedRepertoire.id);
    setView("repertoireDetail");
  }

  function saveRepertoire(repertoire: Repertoire) {
    var repertoireToSave = pendingRepertoireSong ? {
      ...repertoire,
      songs: repertoire.songs.some(function (item) {
        return item.songId === pendingRepertoireSong.id;
      }) ? repertoire.songs : repertoire.songs.concat({
        songId: pendingRepertoireSong.id,
        order: repertoire.songs.length + 1,
        key: pendingRepertoireSong.currentKey,
        capo: 0,
        note: ""
      })
    } : repertoire;

    setRepertoires(function (currentRepertoires) {
      var alreadyExists = currentRepertoires.some(function (item) {
        return item.id === repertoireToSave.id;
      });

      if (alreadyExists) {
        return currentRepertoires.map(function (item) {
          return item.id === repertoireToSave.id ? repertoireToSave : item;
        });
      }

      return [repertoireToSave].concat(currentRepertoires);
    });

    setSelectedRepertoireId(repertoireToSave.id);
    setPendingRepertoireSongId("");
    setView(pendingRepertoireSong ? "repertoireDetail" : "repertoires");
    apiRequest<Repertoire>("POST", "/repertoires", repertoireToSave).catch(function (error) {
      handleWriteError("Nao foi possivel salvar o repertorio na API.", error);
    });
  }

  function saveSong(song: Song) {
    var exists = songs.some(function (item) {
      return item.id === song.id;
    });

    setSongs(function (currentSongs) {
      var alreadyExists = currentSongs.some(function (item) {
        return item.id === song.id;
      });

      if (alreadyExists) {
        return currentSongs.map(function (item) {
          return item.id === song.id ? song : item;
        });
      }

      return [song].concat(currentSongs);
    });

    openSong(song);
    apiRequest<Song>(exists ? "PUT" : "POST", exists ? "/songs/" + encodeURIComponent(song.id) : "/songs", song).catch(function (error) {
      handleWriteError("Nao foi possivel salvar a musica na API.", error);
    });
  }

  function deleteSong(song: Song) {
    setSongs(function (currentSongs) {
      return currentSongs.filter(function (item) {
        return item.id !== song.id;
      });
    });

    if (selectedSongId === song.id) {
      var remainingSong = songs.filter(function (item) {
        return item.id !== song.id;
      })[0];

      if (remainingSong) {
        setSelectedSongId(remainingSong.id);
        setCurrentKey(remainingSong.currentKey);
      }
    }

    setSongToDelete(null);
    apiRequest<void>("DELETE", "/songs/" + encodeURIComponent(song.id)).catch(function (error) {
      handleWriteError("Nao foi possivel excluir a musica na API.", error);
    });
  }

  function deleteRepertoire(repertoire: Repertoire) {
    var remainingRepertoires = repertoires.filter(function (item) {
      return item.id !== repertoire.id;
    });

    setRepertoires(remainingRepertoires);

    if (selectedRepertoireId === repertoire.id) {
      setSelectedRepertoireId(remainingRepertoires[0] ? remainingRepertoires[0].id : "");
    }

    if (addingToRepertoireId === repertoire.id) {
      setAddingToRepertoireId("");
    }

    setRepertoireToDelete(null);
    apiRequest<void>("DELETE", "/repertoires/" + encodeURIComponent(repertoire.id)).catch(function (error) {
      handleWriteError("Nao foi possivel excluir o repertorio na API.", error);
    });
  }

  function saveAuthSession(session: AuthSession) {
    clearSessionScopedState();
    writeCachedAuthSession(session);
    setAuthSession(session);
    setAuthChecked(true);
    setAuthNotice("");
    setView("search");
    refreshAppData(true, true, true).then(function () {
      refreshSyncVersion();
    });
  }

  function logout() {
    clearSessionScopedState();
    clearCachedAuthSession();
    setSongs([]);
    setSelectedSongId("");
    setAuthSession(null);
    setAuthNotice("");
    setView("account");
    apiRequest<void>("POST", "/auth/logout").catch(function (error) {
      console.warn("Nao foi possivel encerrar a sessao na API.", error);
    });
  }

  function handleAuthExpired() {
    clearCachedAuthSession();
    setAuthSession(null);
    setAuthChecked(true);
    setAuthNotice("Entre novamente para continuar.");
    setWorkspaceUsers([]);
    setWorkspaceUsersLoading(false);
    setWorkspaceUsersLoadError(false);
    setWorkspaceUsersLoaded(false);
    setSongToDelete(null);
    setRepertoireToDelete(null);
    setView("account");
    return true;
  }

  function handleWriteError(message: string, error: unknown) {
    if (isAuthError(error)) {
      handleAuthExpired();
      return;
    }

    console.warn(message, error);
  }

  var editingSong = editingSongId ? songs.filter(function (song) {
    return song.id === editingSongId;
  })[0] || null : null;

  function renderDeleteDialog() {
    if (songToDelete) {
      var song = songToDelete;
      return (
        <DeleteSongDialog
          song={song}
          onCancel={() => setSongToDelete(null)}
          onConfirm={() => deleteSong(song)}
        />
      );
    }

    if (repertoireToDelete) {
      var repertoire = repertoireToDelete;
      return (
        <DeleteRepertoireDialog
          repertoire={repertoire}
          onCancel={() => setRepertoireToDelete(null)}
          onConfirm={() => deleteRepertoire(repertoire)}
        />
      );
    }

    return null;
  }

  if (!authChecked && !authSession) {
    return (
      <div className={isLegacyReadOnly ? "appShell legacyVisualMode" : "appShell"}>
        <AccountScreen session={null} notice={authNotice} legacyMode={isLegacyReadOnly} syncing={true} onLogin={saveAuthSession} onLogout={logout} onNavigate={setView} />
      </div>
    );
  }

  if (authChecked && !authSession) {
    return (
      <div className={isLegacyReadOnly ? "appShell legacyVisualMode" : "appShell"}>
        <AccountScreen session={null} notice={authNotice} legacyMode={isLegacyReadOnly} onLogin={saveAuthSession} onLogout={logout} onNavigate={setView} />
      </div>
    );
  }

  var isCheckingSession = !authChecked;
  var permissionsReady = authChecked && Boolean(authSession);
  var canWriteRepertoires = permissionsReady && !isLegacyReadOnly && canManageRepertoires(authSession);
  var canManageGlobalSongs = permissionsReady && !isLegacyReadOnly && canManageSongs(authSession);
  var canWriteRepertoiresOnHydration = Boolean(authSession) && !isLegacyReadOnly && canManageRepertoires(authSession);
  var canManageGlobalSongsOnHydration = Boolean(authSession) && !isLegacyReadOnly && canManageSongs(authSession);
  var songCreateState: PermissionState = isCheckingSession ? "checking" : (canManageGlobalSongs ? "allowed" : "denied");
  var repertoireCreateState: PermissionState = isCheckingSession ? "checking" : (canWriteRepertoires ? "allowed" : "denied");

  return (
    <div className={isLegacyReadOnly ? "appShell legacyVisualMode" : "appShell"}>
      {(initialSongId && view === "search" && selectedSong) ? <SongScreen song={selectedSong} onBack={() => setView("library")} onChangeKey={setCurrentKey} onStartAddSongFlow={canWriteRepertoires ? startAddSongFlow : undefined} /> : null}
      {(initialSongId && view === "search" && !selectedSong && songsLoading) ? <SongRestoreScreen onBack={() => setView("library")} /> : null}
      {view === "search" && (!initialSongId || selectedSong || !songsLoading) && (!initialSongId || !selectedSong) && <SearchScreen songs={songs} popularSongs={popularSongs} popularSongsLoading={popularSongsLoading} topArtists={topArtists} topArtistsLoading={topArtistsLoading} onOpenSong={openSong} onStartAddSongFlow={canWriteRepertoires ? startAddSongFlow : undefined} onNavigate={setView} />}
      {view === "library" && <LibraryScreen songs={songs} loading={songsLoading} loadError={songsLoadError} onRetryLoad={() => refreshSongs(true, true).then(function () { refreshSyncVersion(); })} libraryPage={libraryPage} onLibraryPageChange={setLibraryPage} addingToRepertoire={canWriteRepertoires ? addingToRepertoire : null} onStopAddingToRepertoire={stopAddingSongsToRepertoire} onAddSongToRepertoire={canWriteRepertoires ? addSongToRepertoire : undefined} onStartAddSongFlow={canWriteRepertoires ? startAddSongFlow : undefined} onOpenSong={openSong} onEditSong={canManageGlobalSongs ? editSong : undefined} onDeleteSong={canManageGlobalSongs ? setSongToDelete : undefined} onNavigate={setView} onCreateSong={canManageGlobalSongsOnHydration ? createSong : undefined} createState={Boolean(authSession) ? (canManageGlobalSongsOnHydration ? "allowed" : "denied") : songCreateState} readOnly={!canWriteRepertoires} />}
      {view === "repertoires" && <RepertoireScreen repertoires={repertoires} loading={repertoiresLoading} loadError={repertoiresLoadError} onRetryLoad={() => refreshRepertoires(true).then(function () { refreshSyncVersion(); })} repertoirePage={repertoirePage} onRepertoirePageChange={setRepertoirePage} pendingSong={canWriteRepertoires ? pendingRepertoireSong : null} onClearPendingSong={() => setPendingRepertoireSongId("")} onAddPendingSongToRepertoire={addPendingSongToRepertoire} onOpenRepertoire={openRepertoire} onDeleteRepertoire={canWriteRepertoires ? setRepertoireToDelete : undefined} onNavigate={setView} onCreateRepertoire={canWriteRepertoiresOnHydration ? createRepertoire : undefined} createState={Boolean(authSession) ? (canWriteRepertoiresOnHydration ? "allowed" : "denied") : repertoireCreateState} readOnly={!canWriteRepertoires} />}
      {view === "repertoireDetail" && selectedRepertoire && <RepertoireDetailScreen repertoire={selectedRepertoire} songs={songs} loading={songsLoading || repertoiresLoading} onBack={() => setView("repertoires")} onNavigate={setView} onAddSongs={canWriteRepertoires ? startAddingSongsToRepertoire : undefined} onOpenSong={openSong} onOpenLive={openRepertoireLive} onUpdateRepertoire={updateRepertoire} readOnly={!canWriteRepertoires} />}
      {view === "repertoireDetail" && !selectedRepertoire && <RepertoireDetailRestoreScreen onBack={() => setView("repertoires")} onNavigate={setView} />}
      {view === "repertoireLive" && selectedRepertoire && <RepertoireLiveScreen repertoire={selectedRepertoire} songs={songs} loading={songsLoading || repertoiresLoading} onBack={() => setView("repertoireDetail")} onUpdateRepertoire={canWriteRepertoires ? updateRepertoire : undefined} readOnly={!canWriteRepertoires} allowLocalKeyChange={isLegacyReadOnly} />}
      {view === "repertoireLive" && !selectedRepertoire && <RepertoireRestoreScreen onBack={() => setView("repertoires")} />}
      {view === "editor" && canManageGlobalSongs && <SongEditorScreen song={editingSong} onCancel={() => setView("library")} onSave={saveSong} />}
      {view === "repertoireEditor" && canWriteRepertoires && <RepertoireEditorScreen onCancel={() => setView("repertoires")} onDone={saveRepertoire} />}
      {view === "account" && (authChecked || isCheckingSession) && authSession?.user.isAppMaster && !isLegacyReadOnly ? <MasterScreen session={authSession} users={workspaceUsers} loading={workspaceUsersLoading || isCheckingSession} loadError={workspaceUsersLoadError} onRetry={refreshWorkspaceUsers} onLogout={logout} onNavigate={setView} /> : null}
      {view === "account" && (authChecked || isCheckingSession) && (!authSession?.user.isAppMaster || isLegacyReadOnly) ? <AccountScreen session={authSession} notice={authNotice} legacyMode={isLegacyReadOnly} syncing={isCheckingSession} onLogin={saveAuthSession} onLogout={logout} onNavigate={setView} /> : null}
      {view === "song" && selectedSong && <SongScreen song={selectedSong} onBack={() => setView("library")} onChangeKey={setCurrentKey} onStartAddSongFlow={canWriteRepertoires ? startAddSongFlow : undefined} />}
      {view === "song" && !selectedSong && songsLoading && <SongRestoreScreen onBack={() => setView("library")} />}
      {renderDeleteDialog()}
    </div>
  );
}

function readApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3333";
  }

  var configuredApiUrl = (window as any).LOUVORFLOW_API_URL as string;

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  return "/api";
}

function readSyncSocketUrl() {
  if (typeof window === "undefined") {
    return "ws://localhost:3333/sync";
  }

  if (API_BASE_URL.indexOf("http://") === 0) {
    return "ws://" + API_BASE_URL.slice("http://".length).replace(/\/$/, "") + "/sync";
  }

  if (API_BASE_URL.indexOf("https://") === 0) {
    return "wss://" + API_BASE_URL.slice("https://".length).replace(/\/$/, "") + "/sync";
  }

  var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  var basePath = API_BASE_URL.replace(/\/$/, "");
  return protocol + "//" + window.location.host + basePath + "/sync";
}

type ApiError = Error & {
  status?: number;
};

function isAuthError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as ApiError).status === 401);
}

function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise(function (resolve, reject) {
    var request = new XMLHttpRequest();
    request.open(method, API_BASE_URL + path, true);
    request.withCredentials = true;
    request.setRequestHeader("Accept", "application/json");

    if (body) {
      request.setRequestHeader("Content-Type", "application/json");
    }

    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }

      if (request.status >= 200 && request.status < 300) {
        if (request.status === 204 || !request.responseText) {
          resolve(undefined as T);
          return;
        }

        resolve(JSON.parse(request.responseText) as T);
        return;
      }

      var errorMessage = "API respondeu com status " + request.status;
      if (request.responseText) {
        try {
          var errorBody = JSON.parse(request.responseText) as { message?: string };
          if (errorBody.message) {
            errorMessage = errorBody.message;
          }
        } catch (error) {
          errorMessage = "API respondeu com status " + request.status;
        }
      }

      var apiError = new Error(errorMessage) as ApiError;
      apiError.status = request.status;
      reject(apiError);
    };

    request.onerror = function () {
      reject(new Error("Falha de rede ao chamar API."));
    };

    request.send(body ? JSON.stringify(body) : undefined);
  });
}

function fetchSongsPage(search: string, limit: number, cursor?: string | null) {
  var path = "/songs?limit=" + encodeURIComponent(String(limit));

  if (search) {
    path += "&q=" + encodeURIComponent(search);
  }

  if (cursor) {
    path += "&cursor=" + encodeURIComponent(cursor);
  }

  return apiRequest<SongPageResponse>("GET", path);
}

function fetchRepertoiresPage(period: RepertoirePeriod, search: string, limit: number, cursor?: string | null) {
  var path = "/repertoires?limit=" + encodeURIComponent(String(limit)) +
    "&period=" + encodeURIComponent(period);

  if (search) {
    path += "&q=" + encodeURIComponent(search);
  }

  if (cursor) {
    path += "&cursor=" + encodeURIComponent(cursor);
  }

  return apiRequest<RepertoirePageResponse>("GET", path);
}

function readInitialSongId() {
  if (typeof window === "undefined") {
    return "";
  }

  var match = window.location.hash.match(/song=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function readInitialNavigation(isLegacyReadOnly: boolean): StoredNavigation {
  var hashView = readHashView(isLegacyReadOnly);
  if (hashView) {
    return {
      view: hashView,
      selectedSongId: readInitialSongId()
    };
  }

  var storedNavigation = readStoredNavigation();
  if (storedNavigation) {
    return storedNavigation;
  }

  return {
    view: "search",
    selectedSongId: readInitialSongId()
  };
}

function readHashView(isLegacyReadOnly: boolean): ViewName | null {
  if (readInitialEditor() && !isLegacyReadOnly) {
    return "editor";
  }

  if (readInitialRepertoires()) {
    return "repertoires";
  }

  if (readInitialLibrary()) {
    return "library";
  }

  if (readInitialSongId()) {
    return "song";
  }

  return null;
}

function readStoredNavigation(): StoredNavigation | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    var rawValue = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    var parsedValue = JSON.parse(rawValue) as Partial<StoredNavigation>;
    if (!isStoredViewName(parsedValue.view)) {
      return null;
    }

    return {
      view: normalizeStoredView(parsedValue.view),
      selectedSongId: typeof parsedValue.selectedSongId === "string" ? parsedValue.selectedSongId : "",
      selectedRepertoireId: typeof parsedValue.selectedRepertoireId === "string" ? parsedValue.selectedRepertoireId : "",
      currentKey: isNoteName(parsedValue.currentKey) ? parsedValue.currentKey : undefined
    };
  } catch (error) {
    return null;
  }
}

function writeStoredNavigation(navigation: StoredNavigation) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
      view: normalizeStoredView(navigation.view),
      selectedSongId: navigation.selectedSongId || "",
      selectedRepertoireId: navigation.selectedRepertoireId || "",
      currentKey: navigation.currentKey || ""
    }));
  } catch (error) {
    // Alguns navegadores antigos podem bloquear storage privado; a navegação segue normal.
  }
}

function isStoredViewName(value: unknown): value is ViewName {
  return typeof value === "string" && ["search", "song", "library", "repertoires", "repertoireDetail", "repertoireLive", "editor", "repertoireEditor", "account"].indexOf(value) >= 0;
}

function normalizeStoredView(view: ViewName): ViewName {
  if (view === "editor") {
    return "library";
  }

  if (view === "repertoireEditor") {
    return "repertoires";
  }

  return view;
}

function isNoteName(value: unknown): value is NoteName {
  return typeof value === "string" && NATURAL_KEYS.concat(FLAT_KEYS).concat(SHARP_KEYS).indexOf(value as NoteName) >= 0;
}

function readInitialEditor() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hash.indexOf("editor") >= 0;
}

function readInitialLibrary() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hash.indexOf("library") >= 0;
}

function readInitialRepertoires() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hash.indexOf("repertoires") >= 0;
}

function SearchScreen(props: { songs: Song[]; popularSongs: Song[]; popularSongsLoading: boolean; topArtists: TopArtist[]; topArtistsLoading: boolean; onOpenSong: (song: Song) => void; onStartAddSongFlow?: (song: Song) => void; onNavigate: (view: ViewName) => void }) {
  var _activeTab = useState("Todas");
  var activeTab = _activeTab[0];
  var setActiveTab = _activeTab[1];
  var searchTabs = ["Todas", "Favoritas", "Artistas", "Álbuns"];
  var favoriteSongs = props.popularSongs.length ? props.popularSongs : props.songs;
  var favoritePreviewSongs = favoriteSongs.slice(0, 12);

  return (
    <div className="catalogScreen searchScreen">
      <header className="libraryHeader searchHeader">
        <h1>Pesquisar</h1>
        <div className="searchBox librarySearchBox">
          <span>⌕</span>
          <input placeholder="Buscar" />
        </div>
        <nav className="libraryTabs searchTabs">
          {searchTabs.map(function (item) {
            return (
              <button className={activeTab === item ? "libraryTab active" : "libraryTab"} key={item} onClick={() => setActiveTab(item)}>
                {item}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="libraryContent searchContent">
        {activeTab === "Todas" ? (
          <Shelf title="Favoritas">
            {props.popularSongsLoading ? (
              <ListFeedback message="Carregando músicas favoritas..." />
            ) : (
              <SongList songs={favoritePreviewSongs} onOpenSong={props.onOpenSong} onStartAddSongFlow={props.onStartAddSongFlow} />
            )}
          </Shelf>
        ) : null}
        {activeTab === "Favoritas" ? (
          props.popularSongsLoading ? (
            <ListFeedback message="Carregando músicas favoritas..." />
          ) : (
            <SongList songs={favoriteSongs} onOpenSong={props.onOpenSong} onStartAddSongFlow={props.onStartAddSongFlow} />
          )
        ) : null}
        {activeTab === "Todas" ? (
          <Shelf title="Top Artistas" spaced>
            {props.topArtistsLoading ? (
              <ListFeedback message="Carregando artistas..." />
            ) : (
              <div className="artistRail">
                {props.topArtists.map(function (artist, index) {
                  return (
                    <button className="artistCard" key={artist.name}>
                      <span className={"artistPhoto artistPhoto" + index}>{artist.name.charAt(0)}</span>
                      <strong>{artist.name}</strong>
                      <small>{formatSongCount(artist.songCount)}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </Shelf>
        ) : null}
        {activeTab === "Artistas" ? (
          props.topArtistsLoading ? (
            <ListFeedback message="Carregando artistas..." />
          ) : (
            <div className="artistList">
              {props.topArtists.map(function (artist, index) {
                return (
                  <button className="artistCard" key={artist.name}>
                    <span className={"artistPhoto artistPhoto" + index}>{artist.name.charAt(0)}</span>
                    <strong>{artist.name}</strong>
                    <small>{formatSongCount(artist.songCount)}</small>
                  </button>
                );
              })}
            </div>
          )
        ) : null}
        {(activeTab === "Todas" || activeTab === "Álbuns") ? (
          <Shelf title="Top Álbuns" spaced>
            <div className="albumRail">
              {["Casa acesa", "A Boa Parte", "Ele e", "Deserto", "Acustico"].map(function (album, index) {
                return (
                  <button className={"albumCover albumCover" + index} key={album}>
                    <span>{album}</span>
                  </button>
                );
              })}
            </div>
          </Shelf>
        ) : null}
      </main>

      <BottomNav active="search" onNavigate={props.onNavigate} />
    </div>
  );
}

function LibraryScreen(props: { songs: Song[]; loading: boolean; loadError: boolean; onRetryLoad: () => void; libraryPage: LibraryPageState; onLibraryPageChange: React.Dispatch<React.SetStateAction<LibraryPageState>>; addingToRepertoire: Repertoire | null; onStopAddingToRepertoire: () => void; onAddSongToRepertoire?: (song: Song) => void; onStartAddSongFlow?: (song: Song) => void; onOpenSong: (song: Song) => void; onEditSong?: (song: Song) => void; onDeleteSong?: (song: Song) => void; onNavigate: (view: ViewName) => void; onCreateSong?: () => void; createState?: PermissionState; readOnly?: boolean }) {
  var query = props.libraryPage.query;
  var pageSongs = props.libraryPage.songs;
  var pageCursor = props.libraryPage.cursor;
  var pageLoading = props.libraryPage.loading;
  var pageLoadingMore = props.libraryPage.loadingMore;
  var pageLoadError = props.libraryPage.loadError;
  var pageRequestId = useRef(0);

  function setQuery(nextQuery: string) {
    props.onLibraryPageChange(function (current) {
      return { ...current, query: nextQuery };
    });
  }

  useEffect(function () {
    var disposed = false;
    var searchText = query.trim();
    var cachedPageIsCurrent = props.libraryPage.loadedQuery === query
      && props.libraryPage.syncedSongCount === props.songs.length
      && !props.libraryPage.loading
      && !props.libraryPage.loadError;

    if (cachedPageIsCurrent) {
      return function () {
        disposed = true;
      };
    }

    var requestId = pageRequestId.current + 1;
    pageRequestId.current = requestId;

    props.onLibraryPageChange(function (current) {
      return {
        ...current,
        songs: [],
        cursor: null,
        loading: true,
        loadingMore: false,
        loadError: false,
        syncedSongCount: props.songs.length
      };
    });

    var timeoutId = window.setTimeout(function () {
      fetchSongsPage(searchText, LIBRARY_INITIAL_PAGE_SIZE).then(function (page) {
        if (disposed || requestId !== pageRequestId.current) {
          return;
        }

        props.onLibraryPageChange(function (current) {
          if (current.query !== query) {
            return current;
          }

          return {
            ...current,
            loadedQuery: query,
            songs: page.items || [],
            cursor: page.nextCursor || null,
            loading: false,
            loadingMore: false,
            loadError: false,
            syncedSongCount: props.songs.length
          };
        });
      }).catch(function () {
        if (disposed || requestId !== pageRequestId.current) {
          return;
        }

        props.onLibraryPageChange(function (current) {
          if (current.query !== query) {
            return current;
          }

          return {
            ...current,
            loadedQuery: query,
            songs: [],
            cursor: null,
            loading: false,
            loadingMore: false,
            loadError: true,
            syncedSongCount: props.songs.length
          };
        });
      });
    }, searchText ? 250 : 0);

    return function () {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [query, props.songs.length]);

  function loadMoreSongs() {
    if (!pageCursor || pageLoading || pageLoadingMore || pageLoadError) {
      return;
    }

    var requestId = pageRequestId.current + 1;
    pageRequestId.current = requestId;
    props.onLibraryPageChange(function (current) {
      return { ...current, loadingMore: true, loadError: false };
    });

    fetchSongsPage(query.trim(), LIBRARY_NEXT_PAGE_SIZE, pageCursor).then(function (page) {
      if (requestId !== pageRequestId.current) {
        return;
      }

      props.onLibraryPageChange(function (current) {
        var existingIds: { [key: string]: boolean } = {};
        current.songs.forEach(function (song) {
          existingIds[song.id] = true;
        });

        return {
          ...current,
          loadedQuery: query,
          songs: current.songs.concat((page.items || []).filter(function (song) {
            return !existingIds[song.id];
          })),
          cursor: page.nextCursor || null,
          loadingMore: false,
          loadError: false,
          syncedSongCount: props.songs.length
        };
      });
    }).catch(function () {
      if (requestId !== pageRequestId.current) {
        return;
      }

      props.onLibraryPageChange(function (current) {
        return { ...current, loadingMore: false, loadError: true };
      });
    });
  }

  function retryLibraryLoad() {
    props.onRetryLoad();
    var requestId = pageRequestId.current + 1;
    pageRequestId.current = requestId;
    props.onLibraryPageChange(function (current) {
      return {
        ...current,
        songs: [],
        cursor: null,
        loading: true,
        loadingMore: false,
        loadError: false,
        syncedSongCount: props.songs.length
      };
    });

    fetchSongsPage(query.trim(), LIBRARY_INITIAL_PAGE_SIZE).then(function (page) {
      if (requestId !== pageRequestId.current) {
        return;
      }

      props.onLibraryPageChange(function (current) {
        if (current.query !== query) {
          return current;
        }

        return {
         ...current,
          loadedQuery: query,
          songs: page.items || [],
          cursor: page.nextCursor || null,
          loading: false,
          loadingMore: false,
          loadError: false,
          syncedSongCount: props.songs.length
        };
      });
    }).catch(function () {
      if (requestId !== pageRequestId.current) {
        return;
      }

      props.onLibraryPageChange(function (current) {
        if (current.query !== query) {
          return current;
        }

        return {
          ...current,
          loadedQuery: query,
          songs: [],
          cursor: null,
          loading: false,
          loadingMore: false,
          loadError: true,
          syncedSongCount: props.songs.length
        };
      });
    });
  }

  function handleLibraryScroll(event: React.UIEvent<HTMLElement>) {
    var target = event.currentTarget;
    var distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceToBottom < 220) {
      loadMoreSongs();
    }
  }

  return (
    <div className="catalogScreen libraryScreen">
      <header className="libraryHeader">
        <h1>Biblioteca</h1>
        {props.addingToRepertoire ? (
          <section className="libraryRepertoireContext" aria-label="Repertório selecionado">
            <span className="libraryRepertoireIcon">♬</span>
            <span className="libraryRepertoireText">
              <strong>{props.addingToRepertoire.name}</strong>
              <small>{formatSongCount(props.addingToRepertoire.songs.length)}{props.addingToRepertoire.eventTime ? " · " + props.addingToRepertoire.eventTime : ""}</small>
            </span>
            <button type="button" onClick={props.onStopAddingToRepertoire} aria-label="Fechar repertório selecionado">×</button>
          </section>
        ) : props.createState === "allowed" && props.onCreateSong ? (
          <button className="primaryButton libraryCreateButton" onClick={props.onCreateSong}>Nova Música</button>
        ) : null}
        <div className="searchBox librarySearchBox">
          <span>⌕</span>
          <input
            aria-label="Buscar músicas"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            value={query}
          />
        </div>
        <nav className="libraryTabs">
          <button className="libraryTab active">Todas</button>
        </nav>
      </header>
      <main className="libraryContent" onScroll={handleLibraryScroll}>
        {props.loading || pageLoading ? (
          <ListFeedback message="Carregando músicas..." />
        ) : props.loadError || pageLoadError ? (
          <ListFeedback actionLabel="Tentar novamente" message="Não foi possível carregar as músicas." onAction={retryLibraryLoad} />
        ) : pageSongs.length ? (
          <>
            <SongList songs={pageSongs} addingToRepertoire={props.addingToRepertoire} onOpenSong={props.onOpenSong} onAddSongToRepertoire={props.onAddSongToRepertoire} onStartAddSongFlow={props.onStartAddSongFlow} onEditSong={props.onEditSong} onDeleteSong={props.onDeleteSong} variant="library" />
            {pageLoadingMore ? (
              <div className="listMoreFeedback">
                <span className="listSpinner" aria-hidden="true" />
                <span>Carregando músicas...</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="emptyLibrary">Nenhuma música encontrada.</div>
        )}
      </main>
      <BottomNav active="library" onNavigate={props.onNavigate} />
    </div>
  );
}

function normalizeSearch(value: string) {
  var text = value.toLowerCase();
  return typeof text.normalize === "function" ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
}

function shouldOpenActionMenuUp(button: HTMLElement, menuHeight: number) {
  if (typeof window === "undefined") {
    return false;
  }

  var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  var rect = button.getBoundingClientRect();
  var boundaryBottom = viewportHeight;
  var parent = button.parentElement;

  while (parent) {
    if (parent.className && typeof parent.className === "string" && (
      parent.className.indexOf("libraryContent") >= 0 ||
      parent.className.indexOf("repertoireContent") >= 0
    )) {
      boundaryBottom = Math.min(boundaryBottom, parent.getBoundingClientRect().bottom);
      break;
    }

    parent = parent.parentElement;
  }

  var spaceBelow = boundaryBottom - rect.bottom;
  var spaceAbove = rect.top;

  return spaceBelow < menuHeight + 16 && spaceAbove > spaceBelow;
}

function RepertoireScreen(props: { repertoires: Repertoire[]; loading: boolean; loadError: boolean; onRetryLoad: () => void; repertoirePage: RepertoirePageState; onRepertoirePageChange: React.Dispatch<React.SetStateAction<RepertoirePageState>>; pendingSong: Song | null; onClearPendingSong: () => void; onAddPendingSongToRepertoire: (repertoire: Repertoire) => void; onOpenRepertoire: (repertoire: Repertoire) => void; onDeleteRepertoire?: (repertoire: Repertoire) => void; onNavigate: (view: ViewName) => void; onCreateRepertoire?: () => void; createState?: PermissionState; readOnly?: boolean }) {
  var query = props.repertoirePage.query;
  var period = props.repertoirePage.period;
  var activePage = props.repertoirePage[period];
  var pageRepertoires = activePage.items;
  var pageCursor = activePage.cursor;
  var pageLoading = activePage.loading;
  var pageLoadingMore = activePage.loadingMore;
  var pageLoadError = activePage.loadError;
  var pageRequestId = useRef(0);
  var _openMenuId = useState("");
  var openMenuId = _openMenuId[0];
  var setOpenMenuId = _openMenuId[1];
  var _openMenuUp = useState(false);
  var openMenuUp = _openMenuUp[0];
  var setOpenMenuUp = _openMenuUp[1];
  var menuRef = useRef<HTMLDivElement | null>(null);
  var today = startOfDay(new Date());
  var repertoireSyncKey = props.repertoires.filter(function (repertoire) {
    var repertoireDate = parseDateOnly(repertoire.date).getTime();
    return period === "past" ? repertoireDate < today.getTime() : repertoireDate >= today.getTime();
  }).map(function (repertoire) {
    return repertoire.id + ":" + repertoire.name + ":" + repertoire.date + ":" + (repertoire.eventTime || "") + ":" + repertoire.songs.length;
  }).join("|");

  function setQuery(nextQuery: string) {
    props.onRepertoirePageChange(function (current) {
      return { ...current, query: nextQuery };
    });
  }

  function setPeriod(nextPeriod: RepertoirePeriod) {
    props.onRepertoirePageChange(function (current) {
      return { ...current, period: nextPeriod };
    });
  }

  useEffect(function () {
    var disposed = false;
    var searchText = query.trim();
    var currentBucket = props.repertoirePage[period];
    var cachedPageIsCurrent = currentBucket.loadedQuery === query
      && currentBucket.syncedRepertoireKey === repertoireSyncKey
      && !currentBucket.loading
      && !currentBucket.loadError;

    if (cachedPageIsCurrent) {
      return function () {
        disposed = true;
      };
    }

    var requestId = pageRequestId.current + 1;
    pageRequestId.current = requestId;

    props.onRepertoirePageChange(function (current) {
      var nextBucket = {
        ...current[period],
        items: [],
        cursor: null,
        loadedQuery: query,
        loading: true,
        loadingMore: false,
        loadError: false,
        syncedRepertoireKey: repertoireSyncKey
      };

      return {
        ...current,
        [period]: nextBucket
      };
    });

    var timeoutId = window.setTimeout(function () {
      fetchRepertoiresPage(period, searchText, REPERTOIRE_INITIAL_PAGE_SIZE).then(function (page) {
        if (disposed || requestId !== pageRequestId.current) {
          return;
        }

        props.onRepertoirePageChange(function (current) {
          if (current.query !== query || current.period !== period) {
            return current;
          }

          return {
            ...current,
            [period]: {
              items: page.items || [],
              cursor: page.nextCursor || null,
              loadedQuery: query,
              loading: false,
              loadingMore: false,
              loadError: false,
              syncedRepertoireKey: repertoireSyncKey
            }
          };
        });
      }).catch(function () {
        if (disposed || requestId !== pageRequestId.current) {
          return;
        }

        props.onRepertoirePageChange(function (current) {
          if (current.query !== query || current.period !== period) {
            return current;
          }

          return {
            ...current,
            [period]: {
              ...current[period],
              items: [],
              cursor: null,
              loadedQuery: query,
              loading: false,
              loadingMore: false,
              loadError: true,
              syncedRepertoireKey: repertoireSyncKey
            }
          };
        });
      });
    }, searchText ? 250 : 0);

    return function () {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [query, period, repertoireSyncKey]);

  useEffect(function () {
    if (!openMenuId) {
      return;
    }

    function closeMenuOnOutsideClick(event: MouseEvent | TouchEvent) {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }

      setOpenMenuId("");
      setOpenMenuUp(false);
    }

    document.addEventListener("mousedown", closeMenuOnOutsideClick);
    document.addEventListener("touchstart", closeMenuOnOutsideClick);
    return function () {
      document.removeEventListener("mousedown", closeMenuOnOutsideClick);
      document.removeEventListener("touchstart", closeMenuOnOutsideClick);
    };
  }, [openMenuId]);

  function retryRepertoireLoad() {
    props.onRepertoirePageChange(function (current) {
      return {
        ...current,
        [period]: {
          ...current[period],
          syncedRepertoireKey: "",
          loadError: false
        }
      };
    });
  }

  function loadMoreRepertoires() {
    if (!pageCursor || pageLoading || pageLoadingMore || pageLoadError) {
      return;
    }

    var requestPeriod = period;
    var requestQuery = query;
    var requestSyncKey = repertoireSyncKey;

    props.onRepertoirePageChange(function (current) {
      return {
        ...current,
        [requestPeriod]: {
          ...current[requestPeriod],
          loadingMore: true,
          loadError: false
        }
      };
    });

    fetchRepertoiresPage(requestPeriod, requestQuery.trim(), REPERTOIRE_NEXT_PAGE_SIZE, pageCursor).then(function (page) {
      props.onRepertoirePageChange(function (current) {
        if (current.query !== requestQuery || current.period !== requestPeriod) {
          return current;
        }

        return {
          ...current,
          [requestPeriod]: {
            ...current[requestPeriod],
            items: current[requestPeriod].items.concat(page.items || []),
            cursor: page.nextCursor || null,
            loading: false,
            loadingMore: false,
            loadError: false,
            syncedRepertoireKey: requestSyncKey
          }
        };
      });
    }).catch(function () {
      props.onRepertoirePageChange(function (current) {
        return {
          ...current,
          [requestPeriod]: {
            ...current[requestPeriod],
            loadingMore: false,
            loadError: true
          }
        };
      });
    });
  }

  function handleRepertoireScroll(event: React.UIEvent<HTMLElement>) {
    var target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 180) {
      loadMoreRepertoires();
    }
  }

  return (
    <div className="catalogScreen repertoireScreen">
      <header className="libraryHeader repertoireHeader">
        <h1>Repertórios</h1>
        {props.createState === "allowed" && props.onCreateRepertoire ? (
          <button className="primaryButton libraryCreateButton" onClick={props.onCreateRepertoire}>Novo Repertório</button>
        ) : null}
        {props.pendingSong ? (
          <section className="libraryRepertoireContext songPendingContext" aria-label="Música selecionada">
            <span className="libraryRepertoireIcon">{props.pendingSong.title.charAt(0)}</span>
            <span className="libraryRepertoireText">
              <strong>{props.pendingSong.title}</strong>
              <small>{formatArtistInfo(props.pendingSong)}</small>
            </span>
            <button type="button" onClick={props.onClearPendingSong} aria-label="Fechar música selecionada">×</button>
          </section>
        ) : null}
        <div className="searchBox librarySearchBox">
          <span>⌕</span>
          <input
            aria-label="Buscar repertórios"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            value={query}
          />
        </div>
        <nav className="libraryTabs repertoireTabs">
          <button className={period === "upcoming" ? "libraryTab active" : "libraryTab"} onClick={() => setPeriod("upcoming")}>Próximos</button>
          <button className={period === "past" ? "libraryTab active" : "libraryTab"} onClick={() => setPeriod("past")}>Anteriores</button>
        </nav>
      </header>
      <main className="libraryContent repertoireContent" onScroll={handleRepertoireScroll}>
        {props.loading || pageLoading ? (
          <ListFeedback message="Carregando repertórios..." />
        ) : props.loadError || pageLoadError ? (
          <ListFeedback actionLabel="Tentar novamente" message="Não foi possível carregar os repertórios." onAction={props.loadError ? props.onRetryLoad : retryRepertoireLoad} />
        ) : pageRepertoires.length ? (
          <>
            {pageRepertoires.map(function (repertoire) {
              var isToday = parseDateOnly(repertoire.date).getTime() === today.getTime();
              return (
                <section className={isToday ? "repertoireCard repertoireCardToday" : "repertoireCard"} key={repertoire.id}>
                  <button className="repertoireCardMain" onClick={() => props.pendingSong ? props.onAddPendingSongToRepertoire(repertoire) : props.onOpenRepertoire(repertoire)}>
                    <span className="repertoireCardTitleLine">
                      <strong>{repertoire.name}</strong>
                      {isToday ? <span className="repertoireTodayPill">Hoje</span> : null}
                    </span>
                    <small>{formatSongCount(repertoire.songs.length)} · {formatDateLabel(repertoire.date)}{repertoire.eventTime ? " · " + repertoire.eventTime : ""}</small>
                  </button>
                  {props.onDeleteRepertoire ? (
                  <div className="repertoireCardActions" ref={openMenuId === repertoire.id ? menuRef : null}>
                    <button
                      className="songMenuButton repertoireMenuButton"
                      onClick={(event) => {
                        event.stopPropagation();
                        var willOpen = openMenuId !== repertoire.id;
                        setOpenMenuId(willOpen ? repertoire.id : "");
                        setOpenMenuUp(willOpen ? shouldOpenActionMenuUp(event.currentTarget, 60) : false);
                      }}
                      title="Ações do repertório"
                    >
                      ⋯
                    </button>
                    {openMenuId === repertoire.id && (
                      <div className={openMenuUp ? "songActionMenu repertoireActionMenu openUp" : "songActionMenu repertoireActionMenu"}>
                        <button
                          className="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId("");
                            setOpenMenuUp(false);
                            if (props.onDeleteRepertoire) {
                              props.onDeleteRepertoire(repertoire);
                            }
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                  ) : null}
                </section>
              );
            })}
            {pageLoadingMore ? (
              <div className="listMoreFeedback">
                <span className="listSpinner" aria-hidden="true" />
                <span>Carregando repertórios...</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="emptyLibrary">Nenhum repertório encontrado.</div>
        )}
      </main>
      <BottomNav active="repertoires" onNavigate={props.onNavigate} />
    </div>
  );
}

function parseDateOnly(value: string) {
  var parts = value.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function ListFeedback(props: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="listFeedback" role={props.actionLabel ? "alert" : "status"}>
      {!props.actionLabel ? <span className="listSpinner" aria-hidden="true" /> : null}
      <span>{props.message}</span>
      {props.actionLabel && props.onAction ? (
        <button className="listFeedbackButton" type="button" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function formatDateLabel(value: string) {
  var parts = value.split("-");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function formatSongCount(count: number) {
  return count + " " + (count === 1 ? "música" : "músicas");
}

function formatLongDateLabel(value: string) {
  var date = parseDateOnly(value);
  var weekdays = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  return weekdays[date.getDay()] + ", " + date.getDate() + " de " + months[date.getMonth()] + " de " + date.getFullYear();
}

function RepertoireDetailRestoreScreen(props: { onBack: () => void; onNavigate: (view: ViewName) => void }) {
  return (
    <div className="repertoireDetailScreen repertoireDetailRestoreScreen">
      <header className="repertoireDetailHero">
        <button className="repertoireBackButton" onClick={props.onBack}>‹</button>
        <span className="repertoireCloudIcon">☁</span>
        <div className="repertoireHeroContent">
          <h1>Repertório</h1>
          <p>Sincronizando dados...</p>
        </div>
      </header>
      <nav className="repertoireDetailTabs">
        <span>Músicas</span>
      </nav>
      <main className="repertoireDetailRestoreContent">
        <span className="listSpinner" aria-hidden="true" />
        <p>Sincronizando repertório...</p>
      </main>
      <BottomNav active="repertoires" onNavigate={props.onNavigate} />
    </div>
  );
}

function RepertoireDetailScreen(props: { repertoire: Repertoire; songs: Song[]; loading?: boolean; onBack: () => void; onNavigate: (view: ViewName) => void; onAddSongs?: (repertoire: Repertoire) => void; onOpenSong: (song: Song) => void; onOpenLive: (repertoire: Repertoire) => void; onUpdateRepertoire: (repertoire: Repertoire) => void; readOnly?: boolean }) {
  var songScrollRef = useRef<HTMLDivElement>(null);
  var _isEditing = useState(false);
  var isEditing = props.readOnly ? false : _isEditing[0];
  var setIsEditing = _isEditing[1];
  var repertoireSongs = props.repertoire.songs
    .slice()
    .sort(function (first, second) {
      return getRepertoireSongOrder(first) - getRepertoireSongOrder(second);
    })
    .map(function (item) {
      var song = props.songs.filter(function (candidate) {
        return candidate.id === item.songId;
      })[0];

      return song ? { item: item, song: song } : null;
    })
    .filter(function (entry): entry is { item: NonNullable<Repertoire["songs"][number]>; song: Song } {
      return Boolean(entry);
    });
  var shouldShowSyncing = Boolean(props.loading) && repertoireSongs.length === 0;
  var canAddSongs = Boolean(props.onAddSongs) && !props.readOnly && !shouldShowSyncing;
  var canOpenOrAdd = repertoireSongs.length > 0 || canAddSongs;

  useLegacyScrollBoundary(songScrollRef, true);

  function openFirstSong() {
    if (repertoireSongs.length) {
      props.onOpenLive(props.repertoire);
      return;
    }

    if (canAddSongs && props.onAddSongs) {
      props.onAddSongs(props.repertoire);
    }
  }

  function addSongs() {
    if (canAddSongs && props.onAddSongs) {
      props.onAddSongs(props.repertoire);
    }
  }

  function saveRepertoireSongs(nextSongs: Repertoire["songs"]) {
    props.onUpdateRepertoire({
      ...props.repertoire,
      songs: nextSongs.map(function (item, index) {
        return {
          ...item,
          order: index + 1
        };
      })
    });
  }

  function removeSong(songId: string) {
    saveRepertoireSongs(props.repertoire.songs
      .slice()
      .sort(function (first, second) {
        return getRepertoireSongOrder(first) - getRepertoireSongOrder(second);
      })
      .filter(function (item) {
        return item.songId !== songId;
      }));
  }

  function moveSong(songId: string, direction: -1 | 1) {
    var nextSongs = props.repertoire.songs.slice().sort(function (first, second) {
      return getRepertoireSongOrder(first) - getRepertoireSongOrder(second);
    });
    var currentIndex = nextSongs.findIndex(function (item) {
      return item.songId === songId;
    });
    var nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nextSongs.length) {
      return;
    }

    var currentSong = nextSongs[currentIndex];
    nextSongs[currentIndex] = nextSongs[nextIndex];
    nextSongs[nextIndex] = currentSong;
    saveRepertoireSongs(nextSongs);
  }

  return (
    <div className="repertoireDetailScreen">
      <header className="repertoireDetailHero">
        <button className="repertoireBackButton" onClick={props.onBack}>‹</button>
        {!props.readOnly ? (
          <button className="repertoireEditButton" onClick={() => setIsEditing(!isEditing)}>{isEditing ? "Pronto" : "Editar"}</button>
        ) : null}
        <span className="repertoireCloudIcon">☁</span>
        <div className="repertoireHeroContent">
          <h1>{props.repertoire.name}</h1>
          <p>
            <span>▦ {formatLongDateLabel(props.repertoire.date)}</span>
            {props.repertoire.eventTime ? <span> | ◴ {props.repertoire.eventTime}</span> : null}
          </p>
          {props.repertoire.description ? <small>{props.repertoire.description}</small> : null}
        </div>
      </header>

      <nav className="repertoireDetailTabs">
        <button className="active">Músicas</button>
      </nav>

      {isEditing && canAddSongs ? (
        <div className="repertoireEditAddBar">
          <button className="repertoireAddSongsButton" onClick={addSongs}>
            <span>+</span>
            Adicionar Músicas
          </button>
        </div>
      ) : null}

      <main className="repertoireSongScroll" ref={songScrollRef}>
        {shouldShowSyncing ? (
          <ListFeedback message="Sincronizando repertório..." />
        ) : repertoireSongs.length ? (
          <div className="repertoireSongList">
            {repertoireSongs.map(function (entry, index) {
              return (
                <article className={isEditing ? "repertoireSongRow editing" : "repertoireSongRow"} key={entry.song.id} onClick={() => !isEditing && props.onOpenLive(props.repertoire)}>
                  {isEditing ? (
                    <button
                      className="repertoireRemoveSongButton"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSong(entry.song.id);
                      }}
                      title="Remover música"
                    >
                      -
                    </button>
                  ) : null}
                  <span className={"cover cover" + index}>{entry.song.title.charAt(0)}</span>
                  <span className="repertoireSongInfo">
                    <strong>{entry.song.title}</strong>
                    <small>{entry.song.artist}</small>
                  </span>
                  <span className="repertoireSongPreset">Predefinição</span>
                  <span className="repertoireSongKey">
                    <strong>{entry.item.key || entry.song.currentKey}</strong>
                    <small>{entry.song.bpm}</small>
                  </span>
                  {isEditing ? (
                    <span className="repertoireOrderControls">
                      <button
                        disabled={index === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          moveSong(entry.song.id, -1);
                        }}
                        title="Subir música"
                      >
                        ˄
                      </button>
                      <button
                        disabled={index === repertoireSongs.length - 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          moveSong(entry.song.id, 1);
                        }}
                        title="Descer música"
                      >
                        ˅
                      </button>
                    </span>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="repertoireEmptySongs">{props.readOnly ? "Nenhuma música no repertório." : "Adicione músicas para o repertório."}</div>
        )}
      </main>

      {canOpenOrAdd ? (
        <button className="openRepertoireButton" onClick={openFirstSong}>
          {repertoireSongs.length ? "Abrir Repertório" : "Adicionar Músicas"}
        </button>
      ) : null}
      <BottomNav active="repertoires" onNavigate={props.onNavigate} />
    </div>
  );
}

function getRepertoireSongOrder(song: Repertoire["songs"][number]) {
  return typeof song.order === "number" ? song.order : 0;
}

function getRepertoireSongEntries(repertoire: Repertoire, songs: Song[]) {
  return repertoire.songs
    .slice()
    .sort(function (first, second) {
      return getRepertoireSongOrder(first) - getRepertoireSongOrder(second);
    })
    .map(function (item) {
      var song = songs.filter(function (candidate) {
        return candidate.id === item.songId;
      })[0];

      return song ? { item: item, song: song } : null;
    })
    .filter(function (entry): entry is { item: NonNullable<Repertoire["songs"][number]>; song: Song } {
      return Boolean(entry);
    });
}

function RepertoireRestoreScreen(props: { onBack: () => void }) {
  return (
    <div className="repertoireLiveScreen liveRestoreScreen">
      <header className="liveTopbar">
        <button className="iconButton plain liveBackButton" onClick={props.onBack}>‹</button>
        <div className="liveSongTitleButton liveRestoreTitle">
          <span>Repertório</span>
        </div>
        <div className="liveActions" />
      </header>
      <div className="liveRestoreContent">
        <span className="listSpinner" aria-hidden="true" />
        <p>Sincronizando repertório...</p>
      </div>
    </div>
  );
}

function SongRestoreScreen(props: { onBack: () => void }) {
  return (
    <div className="songScreen songRestoreScreen">
      <div className="songStickyHeader">
        <header className="songTopbar">
          <button className="iconButton plain" onClick={props.onBack}>‹</button>
          <h1>Música</h1>
          <div className="songActions" />
        </header>
      </div>
      <div className="songRestoreContent">
        <span className="listSpinner" aria-hidden="true" />
        <p>Sincronizando música...</p>
      </div>
    </div>
  );
}

function useLegacyScrollBoundary(ref: React.RefObject<HTMLDivElement>, enabled: boolean) {
  useEffect(function () {
    if (!enabled || typeof document === "undefined" || !document.body.classList.contains("legacyVisualRoot")) {
      return;
    }

    var element = ref.current;

    if (!element) {
      return;
    }

    var scrollElement: HTMLDivElement = element;
    var startY = 0;

    function handleTouchStart(event: TouchEvent) {
      if (!event.touches || !event.touches.length) {
        return;
      }

      startY = event.touches[0].clientY;
    }

    function handleTouchMove(event: TouchEvent) {
      if (!event.touches || !event.touches.length) {
        return;
      }

      var deltaY = event.touches[0].clientY - startY;
      var canScroll = scrollElement.scrollHeight > scrollElement.clientHeight + 1;
      var atTop = scrollElement.scrollTop <= 0;
      var atBottom = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 1;

      if (!canScroll || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }

    scrollElement.addEventListener("touchstart", handleTouchStart, false);
    scrollElement.addEventListener("touchmove", handleTouchMove, false);

    return function () {
      scrollElement.removeEventListener("touchstart", handleTouchStart, false);
      scrollElement.removeEventListener("touchmove", handleTouchMove, false);
    };
  }, [enabled, ref]);
}

function RepertoireLiveScreen(props: { repertoire: Repertoire; songs: Song[]; loading?: boolean; onBack: () => void; onUpdateRepertoire?: (repertoire: Repertoire) => void; readOnly?: boolean; allowLocalKeyChange?: boolean }) {
  var viewportWidth = useViewportWidth();
  var liveChartViewportRef = useRef<HTMLDivElement>(null);
  var entries = getRepertoireSongEntries(props.repertoire, props.songs);
  var _currentIndex = useState(0);
  var currentIndex = _currentIndex[0];
  var setCurrentIndex = _currentIndex[1];
  var _settingsOpen = useState(false);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  var _songPickerOpen = useState(false);
  var songPickerOpen = _songPickerOpen[0];
  var setSongPickerOpen = _songPickerOpen[1];
  var liveSongPickerOverlayRef = useRef<HTMLDivElement>(null);
  var liveSongPickerListRef = useRef<HTMLDivElement>(null);
  var _activeSection = useState("");
  var activeSection = _activeSection[0];
  var setActiveSection = _activeSection[1];
  var _liveKey = useState<NoteName>("C");
  var liveKey = _liveKey[0];
  var setLiveKey = _liveKey[1];
  var touchStartX = useRef(0);
  var touchStartY = useRef(0);
  var safeIndex = entries.length ? Math.min(currentIndex, entries.length - 1) : 0;
  var currentEntry = entries[safeIndex] || null;
  var currentSong = currentEntry ? transposeSong(currentEntry.song, liveKey) : null;

  useLegacyScrollBoundary(liveChartViewportRef, !songPickerOpen && !settingsOpen);

  useEffect(function () {
    if (!currentEntry) {
      return;
    }

    var entryKey = currentEntry.item.key || currentEntry.song.currentKey;
    setLiveKey(entryKey);
    setActiveSection(currentEntry.song.sections[0] ? currentEntry.song.sections[0].id : "");
  }, [currentEntry ? currentEntry.song.id : "", safeIndex]);

  function goToSong(index: number) {
    if (index < 0 || index >= entries.length) {
      return;
    }

    setCurrentIndex(index);
    setSongPickerOpen(false);

    if (typeof window !== "undefined") {
      window.setTimeout(function () {
        if (liveChartViewportRef.current) {
          liveChartViewportRef.current.scrollTop = 0;
        }
      }, 0);
    }
  }

  function selectSection(sectionId: string) {
    setActiveSection(sectionId);

    if (typeof window === "undefined" || (viewportWidth > 900 && isLegacyVisualMode())) {
      return;
    }

    window.setTimeout(function () {
      var target = document.getElementById("section-live-" + sectionId);
      var chartViewport = liveChartViewportRef.current;
      if (target && chartViewport) {
        var viewportTop = chartViewport.getBoundingClientRect().top;
        var targetTop = target.getBoundingClientRect().top;
        var topOffset = 12;
        if (viewportWidth > 900) {
          var chartViewportStyle = window.getComputedStyle ? window.getComputedStyle(chartViewport) : null;
          topOffset = chartViewportStyle ? parseFloat(chartViewportStyle.paddingTop || "0") || 0 : 0;
        }
        chartViewport.scrollTop = chartViewport.scrollTop + targetTop - viewportTop - topOffset;
      }
    }, 0);
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    var deltaX = event.changedTouches[0].clientX - touchStartX.current;
    var deltaY = event.changedTouches[0].clientY - touchStartY.current;

    if (settingsOpen || songPickerOpen || Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      goToSong(safeIndex + 1);
      return;
    }

    goToSong(safeIndex - 1);
  }

  function isLegacyVisualMode() {
    return typeof document !== "undefined" && document.body.classList.contains("legacyVisualRoot");
  }

  function changeCurrentSongKey(key: NoteName) {
    if (!currentEntry) {
      return;
    }

    if (props.allowLocalKeyChange && props.readOnly) {
      setLiveKey(key);
      return;
    }

    if (props.readOnly || !props.onUpdateRepertoire) {
      return;
    }

    setLiveKey(key);
    props.onUpdateRepertoire({
      ...props.repertoire,
      songs: props.repertoire.songs.map(function (item) {
        if (item.songId !== currentEntry.item.songId) {
          return item;
        }

        return {
          ...item,
          key: key
        };
      })
    });
  }

  useEffect(function () {
    if (!songPickerOpen || !isLegacyVisualMode()) {
      return;
    }

    var overlay = liveSongPickerOverlayRef.current;
    var list = liveSongPickerListRef.current;

    if (!overlay || !list) {
      return;
    }

    var overlayElement: HTMLDivElement = overlay;
    var listElement: HTMLDivElement = list;
    var startY = 0;

    function handleListTouchStart(event: TouchEvent) {
      if (!event.touches || !event.touches.length) {
        return;
      }

      startY = event.touches[0].clientY;
      event.stopPropagation();
    }

    function handleListTouchMove(event: TouchEvent) {
      event.stopPropagation();

      if (!event.touches || !event.touches.length) {
        return;
      }

      var deltaY = event.touches[0].clientY - startY;
      var atTop = listElement.scrollTop <= 0;
      var atBottom = listElement.scrollTop + listElement.clientHeight >= listElement.scrollHeight - 1;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }

    function handleOverlayTouchMove(event: TouchEvent) {
      event.preventDefault();
    }

    overlayElement.addEventListener("touchmove", handleOverlayTouchMove, false);
    listElement.addEventListener("touchstart", handleListTouchStart, false);
    listElement.addEventListener("touchmove", handleListTouchMove, false);

    return function () {
      overlayElement.removeEventListener("touchmove", handleOverlayTouchMove, false);
      listElement.removeEventListener("touchstart", handleListTouchStart, false);
      listElement.removeEventListener("touchmove", handleListTouchMove, false);
    };
  }, [songPickerOpen]);

  if ((!currentEntry || !currentSong) && props.loading) {
    return <RepertoireRestoreScreen onBack={props.onBack} />;
  }

  if (!currentEntry || !currentSong) {
    return (
      <div className="repertoireLiveScreen emptyLive">
        <button className="iconButton plain" onClick={props.onBack}>‹</button>
        <p>Adicione músicas para abrir o repertório.</p>
      </div>
    );
  }

  return (
    <div
      className={settingsOpen || songPickerOpen ? "repertoireLiveScreen dimmed" : "repertoireLiveScreen"}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
        touchStartY.current = event.touches[0].clientY;
      }}
      onTouchEnd={handleTouchEnd}
    >
      <header className="liveTopbar">
        <button className="iconButton plain liveBackButton" onClick={props.onBack}>‹</button>
        <button className="liveSongTitleButton" onClick={() => setSongPickerOpen(true)}>
          <span>{currentSong.title}</span>
          <small>⌄</small>
        </button>
        <div className="liveActions">
          {(!props.readOnly || props.allowLocalKeyChange) ? <button className="keyButton" onClick={() => setSettingsOpen(true)}>{currentSong.currentKey}</button> : null}
          <button className="iconButton liveMoreButton" onClick={() => setSongPickerOpen(true)}>•••</button>
        </div>
      </header>

      <nav
        className="sectionRail liveSectionRail"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        {currentSong.sections.map(function (section) {
          return (
            <button
              className={activeSection === section.id ? "sectionDot active " + section.kind : "sectionDot " + section.kind}
              key={section.id}
              onClick={() => selectSection(section.id)}
            >
              {section.code}
            </button>
          );
        })}
      </nav>

      <div className="liveChartViewport" ref={liveChartViewportRef}>
        <main className="chartGrid liveChartGrid">
          {currentSong.sections.map(function (section) {
            return <SectionCard key={section.id} section={{ ...section, id: "live-" + section.id }} active={activeSection === section.id} viewportWidth={viewportWidth} preserveLayout={true} />;
          })}
        </main>
      </div>

      <nav className="livePageDots" aria-label="Músicas do repertório">
        {entries.map(function (entry, index) {
          return (
            <button
              className={index === safeIndex ? "active" : ""}
              key={entry.song.id}
              onClick={() => goToSong(index)}
              aria-label={"Ir para " + entry.song.title}
            />
          );
        })}
      </nav>

      {songPickerOpen ? (
        <div className="livePickerOverlay" ref={liveSongPickerOverlayRef} onClick={() => setSongPickerOpen(false)}>
          <section className="liveSongPicker" onClick={(event) => event.stopPropagation()}>
            <header>
              <span className="cover cover0">{props.repertoire.name.charAt(0)}</span>
              <div>
                <strong>{props.repertoire.name}</strong>
                <small>♫ {formatSongCount(entries.length)} {props.repertoire.eventTime ? " · ◴ " + props.repertoire.eventTime : ""}</small>
              </div>
            </header>
            <div className="liveSongPickerList" ref={liveSongPickerListRef}>
              {entries.map(function (entry, index) {
                return (
                  <button className={index === safeIndex ? "active" : ""} key={entry.song.id} onClick={() => goToSong(index)}>
                    <span className={"cover cover" + index}>{entry.song.title.charAt(0)}</span>
                    <span className="livePickerInfo">
                      <strong>{entry.song.title}</strong>
                      <small>{entry.song.artist}</small>
                      <small>Predefinição</small>
                    </span>
                    <span className="livePickerKey">
                      <strong>{entry.item.key || entry.song.currentKey}</strong>
                      <small>{entry.song.bpm}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {settingsOpen && (
        <ChordSettings
          song={currentSong}
          onClose={() => setSettingsOpen(false)}
          onChangeKey={changeCurrentSongKey}
        />
      )}
    </div>
  );
}

function formatDateInput(date: Date) {
  var month = String(date.getMonth() + 1);
  var day = String(date.getDate());
  if (month.length === 1) {
    month = "0" + month;
  }
  if (day.length === 1) {
    day = "0" + day;
  }
  return date.getFullYear() + "-" + month + "-" + day;
}

function formatTimeInput(date: Date) {
  var hours = String(date.getHours());
  var minutes = String(date.getMinutes());
  if (hours.length === 1) {
    hours = "0" + hours;
  }
  if (minutes.length === 1) {
    minutes = "0" + minutes;
  }
  return hours + ":" + minutes;
}

function createRepertoireId(name: string) {
  var baseId = slugify(name).slice(0, 48) || "repertorio";
  var timestamp = Date.now().toString(36);
  var randomPart = Math.floor(Math.random() * 1000000).toString(36);
  return baseId + "-" + timestamp + "-" + randomPart;
}

function RepertoireEditorScreen(props: { onCancel: () => void; onDone: (repertoire: Repertoire) => void }) {
  var _name = useState("");
  var name = _name[0];
  var setName = _name[1];
  var todayDate = formatDateInput(new Date());
  var _date = useState(todayDate);
  var date = _date[0];
  var setDate = _date[1];
  var _eventTime = useState(formatTimeInput(new Date()));
  var eventTime = _eventTime[0];
  var setEventTime = _eventTime[1];
  var _description = useState("");
  var description = _description[0];
  var setDescription = _description[1];

  function saveRepertoire() {
    var repertoireName = name.trim() || "Novo repertório";
    props.onDone({
      id: createRepertoireId(repertoireName),
      name: repertoireName,
      date: date || todayDate,
      eventTime: eventTime,
      description: description.trim(),
      songs: []
    });
  }

  return (
    <div className="repertoireEditorScreen">
      <header className="repertoireEditorTopbar">
        <button className="textActionButton" onClick={props.onCancel}>Cancelar</button>
        <h1>Repertório</h1>
        <button className="textActionButton done" onClick={saveRepertoire}>Pronto</button>
      </header>

      <main className="repertoireForm">
        <label className="repertoireField">
          Nome do Repertório
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="ex. Culto da manhã"
            value={name}
          />
        </label>

        <div className="repertoireFieldGrid">
          <label className="repertoireField">
            Data
            <input
              onBlur={(event) => {
                var selectedDate = event.target.value;
                if (selectedDate && selectedDate < todayDate) {
                  setDate("");
                }
              }}
              onChange={(event) => setDate(event.target.value)}
              min={todayDate}
              type="date"
              value={date}
            />
          </label>

          <label className="repertoireField">
            Horário do Culto
            <input
              onChange={(event) => setEventTime(event.target.value)}
              type="time"
              value={eventTime}
            />
          </label>
        </div>

        <label className="repertoireField">
          Descrição
          <textarea
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descrição"
            value={description}
          />
        </label>
      </main>
    </div>
  );
}

function normalizeDisplaySections(sections: SongSection[]) {
  return sections.map(function (section) {
    var lines = section.lines.slice();

    while (lines.length && !lines[0].lyric && !lines[0].chords.length) {
      lines = lines.slice(1);
    }

    if (lines.length && !lines[lines.length - 1].lyric && !lines[lines.length - 1].chords.length) {
      lines = lines.slice(0, lines.length - 1);
    }

    return {
      ...section,
      lines: lines
    };
  });
}

function SongEditorScreen(props: { song?: Song | null; onCancel: () => void; onSave: (song: Song) => void }) {
  var viewportWidth = useViewportWidth();
  var isEditing = Boolean(props.song);
  var _title = useState(props.song ? props.song.title : "Nova Música");
  var title = _title[0];
  var setTitle = _title[1];
  var _artist = useState(props.song ? props.song.artist : "");
  var artist = _artist[0];
  var setArtist = _artist[1];
  var _originalKey = useState<NoteName>(props.song ? props.song.originalKey : "D");
  var originalKey = _originalKey[0];
  var setOriginalKey = _originalKey[1];
  var _bpm = useState(props.song ? props.song.bpm : 72);
  var bpm = _bpm[0];
  var setBpm = _bpm[1];
  var _rawChart = useState(props.song ? getEditableChart(props.song) : "[Intro]\nD  G  D  G\n\n[Verso 1]\nD             G              D\nTe amo Deus Tua graça nunca falha\nA/C#       Bm       G\nTodos os dias eu estou");
  var rawChart = _rawChart[0];
  var setRawChart = _rawChart[1];
  var _previewSong = useState<Song | null>(props.song || null);
  var previewSong = _previewSong[0];
  var setPreviewSong = _previewSong[1];

  useEffect(function () {
    setTitle(props.song ? props.song.title : "Nova Música");
    setArtist(props.song ? props.song.artist : "");
    setOriginalKey(props.song ? props.song.originalKey : "D");
    setBpm(props.song ? props.song.bpm : 72);
    setRawChart(props.song ? getEditableChart(props.song) : "[Intro]\nD  G  D  G\n\n[Verso 1]\nD             G              D\nTe amo Deus Tua graça nunca falha\nA/C#       Bm       G\nTodos os dias eu estou");
    setPreviewSong(props.song || null);
  }, [props.song ? props.song.id : ""]);

  function buildSongFromForm() {
    var sections = normalizeDisplaySections(parseChordSheet(rawChart));
    var songTitle = title.trim() || "Nova Música";

    return {
      id: props.song ? props.song.id : slugify(songTitle),
      title: songTitle,
      artist: artist.trim() || "Sem artista",
      originalKey: originalKey,
      currentKey: originalKey,
      bpm: bpm || 72,
      timeSignature: "4/4",
      favorite: props.song ? props.song.favorite : false,
      rawChart: rawChart,
      sections: sections.length ? sections : [
        {
          id: "rascunho",
          code: "S1",
          name: "Rascunho",
          kind: "verse",
          lines: []
        }
      ]
    } as Song;
  }

  useEffect(function () {
    setPreviewSong(buildSongFromForm());
  }, [title, artist, originalKey, bpm, rawChart, props.song ? props.song.id : ""]);

  function saveSong() {
    props.onSave(buildSongFromForm());
  }

  return (
    <div className="editorScreen">
      <header className="editorTopbar">
        <button className="iconButton plain" onClick={props.onCancel}>‹</button>
        <h1>{isEditing ? "Editar Música" : "Nova Música"}</h1>
        <button className="primaryButton" onClick={saveSong}>Salvar</button>
      </header>

      <main className="editorLayout">
        <section className="editorPanel">
          <div className="fieldGrid">
            <label>
              Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Artista
              <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Opcional" />
            </label>
            <label>
              Tom original
              <select value={originalKey} onChange={(event) => setOriginalKey(event.target.value as NoteName)}>
                {NATURAL_KEYS.concat(FLAT_KEYS).concat(SHARP_KEYS).map(function (key) {
                  return <option key={key} value={key}>{key}</option>;
                })}
              </select>
            </label>
            <label>
              BPM
              <input type="number" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
            </label>
          </div>

          <div className="chartInputLabel">
            <span>Cifra</span>
            <ChordTextEditor value={rawChart} onChange={setRawChart} />
          </div>

          <div className="editorActions">
            <button className="secondaryButton" onClick={props.onCancel}>Cancelar</button>
          </div>
        </section>

        <section className="editorPreview">
          <div className="previewHeader">
            <h2>Prévia</h2>
            <span>{previewSong ? previewSong.sections.length + " seções" : "Sem prévia"}</span>
          </div>
          {previewSong ? (
            <div className="previewChart">
              {previewSong.sections.map(function (section, index) {
                return <SectionCard key={section.id} section={section} active={index === 0} viewportWidth={viewportWidth} preserveLayout={true} />;
              })}
            </div>
          ) : (
            <div className="emptyPreview">Cole ou digite uma cifra para ver a prévia.</div>
          )}
        </section>
      </main>
    </div>
  );
}

function ChordTextEditor(props: { value: string; onChange: (value: string) => void }) {
  if (shouldUsePlainChartEditor()) {
    return <PlainChordTextEditor value={props.value} onChange={props.onChange} />;
  }

  return <ModernChordTextEditor value={props.value} onChange={props.onChange} />;
}

function PlainChordTextEditor(props: { value: string; onChange: (value: string) => void }) {
  return (
    <textarea
      className="chartCodeEditor chartCodeTextarea"
      value={props.value}
      onChange={function (event) {
        props.onChange(event.currentTarget.value);
      }}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

function ModernChordTextEditor(props: { value: string; onChange: (value: string) => void }) {
  var editorHostRef = useRef<HTMLDivElement | null>(null);
  var editorViewRef = useRef<any>(null);
  var onChangeRef = useRef(props.onChange);

  useEffect(function () {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  useEffect(function () {
    var disposed = false;

    Promise.all([
      import("@codemirror/state"),
      import("@codemirror/view")
    ]).then(function (modules) {
      if (disposed || !editorHostRef.current) {
        return;
      }

      var EditorState = modules[0].EditorState;
      var EditorView = modules[1].EditorView;
      var editorView = new EditorView({
        parent: editorHostRef.current,
        state: EditorState.create({
          doc: props.value,
          extensions: [
            EditorView.editable.of(true),
            EditorView.contentAttributes.of({
              autocapitalize: "off",
              autocorrect: "off",
              contenteditable: "true",
              spellcheck: "false"
            }),
            EditorView.updateListener.of(function (update: any) {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            })
          ]
        })
      });

      editorViewRef.current = editorView;
    }).catch(function (error) {
      console.warn("Nao foi possivel carregar o editor moderno.", error);
    });

    return function () {
      disposed = true;

      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, []);

  useEffect(function () {
    var editorView = editorViewRef.current;

    if (!editorView) {
      return;
    }

    var currentValue = editorView.state.doc.toString();

    if (currentValue !== props.value) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: props.value
        }
      });
    }
  }, [props.value]);

  return <div className="chartCodeEditor" ref={editorHostRef} />;
}

function shouldUsePlainChartEditor() {
  if (typeof navigator === "undefined") {
    return true;
  }

  var userAgent = navigator.userAgent || "";
  var iosMatch = userAgent.match(/OS (\d+)_/);
  var isIOS = /iPad|iPhone|iPod/.test(userAgent);

  if (isIOS && iosMatch && Number(iosMatch[1]) <= 9) {
    return true;
  }

  return typeof Promise === "undefined";
}

function shouldUseLegacyReadOnlyMode() {
  return shouldUsePlainChartEditor();
}

function slugify(value: string) {
  var text = value.toLowerCase();
  var normalized = typeof text.normalize === "function" ? text.normalize("NFD") : text;

  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "nova-musica";
}

function getEditableChart(song: Song) {
  if (song.rawChart && song.rawChart.trim()) {
    return song.rawChart;
  }

  return song.sections.map(function (section) {
    var lines = ["[" + section.name + "]"];

    section.lines.forEach(function (line) {
      var chordText = buildChordText(line.chords);

      if (chordText) {
        lines.push(chordText);
      }

      if (line.lyric) {
        lines.push(line.lyric);
      }
    });

    return lines.join("\n");
  }).join("\n\n");
}

function Shelf(props: { title: string; children: React.ReactNode; spaced?: boolean }) {
  var className = props.spaced ? "shelf shelfSpaced" : "shelf";
  if (props.title === "Favoritas") {
    className += " shelfFavorites";
  }

  return (
    <section className={className}>
      <div className="shelfTitle">
        <h2>{props.title}</h2>
        <button>Ver Tudo</button>
      </div>
      {props.children}
    </section>
  );
}

function SongList(props: { songs: Song[]; addingToRepertoire?: Repertoire | null; onOpenSong: (song: Song) => void; onAddSongToRepertoire?: (song: Song) => void; onStartAddSongFlow?: (song: Song) => void; onEditSong?: (song: Song) => void; onDeleteSong?: (song: Song) => void; variant?: "library" }) {
  var isLibrary = props.variant === "library";
  var viewportWidth = useViewportWidth();
  var canTapRowToAdd = isLibrary && Boolean(props.addingToRepertoire) && viewportWidth <= 900 && !shouldUseLegacyReadOnlyMode();
  var _openMenuId = useState("");
  var openMenuId = _openMenuId[0];
  var setOpenMenuId = _openMenuId[1];
  var _openMenuUp = useState(false);
  var openMenuUp = _openMenuUp[0];
  var setOpenMenuUp = _openMenuUp[1];
  var menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(function () {
    if (!openMenuId) {
      return;
    }

    function closeMenuOnOutsideClick(event: MouseEvent | TouchEvent) {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }

      setOpenMenuId("");
      setOpenMenuUp(false);
    }

    document.addEventListener("mousedown", closeMenuOnOutsideClick);
    document.addEventListener("touchstart", closeMenuOnOutsideClick);
    return function () {
      document.removeEventListener("mousedown", closeMenuOnOutsideClick);
      document.removeEventListener("touchstart", closeMenuOnOutsideClick);
    };
  }, [openMenuId]);

  function handleSongPrimaryAction(song: Song, alreadyInRepertoire: boolean) {
    if (canTapRowToAdd) {
      if (!alreadyInRepertoire && props.onAddSongToRepertoire) {
        props.onAddSongToRepertoire(song);
      }
      return;
    }

    props.onOpenSong(song);
  }

  return (
    <div className={isLibrary ? "librarySongList" : "songGrid"}>
      {props.songs.map(function (song, index) {
        var isAddingMode = Boolean(props.addingToRepertoire);
        var alreadyInRepertoire = props.addingToRepertoire ? props.addingToRepertoire.songs.some(function (item) {
          return item.songId === song.id;
        }) : false;

        return (
          <article className={isLibrary ? "songRow librarySongRow" : "songRow"} key={song.id} onClick={canTapRowToAdd ? () => handleSongPrimaryAction(song, alreadyInRepertoire) : undefined}>
            <button className={"cover cover" + index} onClick={(event) => { event.stopPropagation(); handleSongPrimaryAction(song, alreadyInRepertoire); }}>
              {isAddingMode && alreadyInRepertoire ? <span className="songAddedCorner">✓</span> : null}
              {song.title.charAt(0)}
            </button>
            <button className="songMeta" onClick={(event) => { event.stopPropagation(); handleSongPrimaryAction(song, alreadyInRepertoire); }}>
              <strong>{song.title}</strong>
              <small>{isLibrary ? formatArtistInfo(song) : song.artist}</small>
            </button>
            {isLibrary && <span className="songArtist">{formatArtistInfo(song)}</span>}
            {isLibrary && props.onEditSong && props.onDeleteSong ? (
              <div className="songRowActions" ref={openMenuId === song.id ? menuRef : null}>
                <button
                  className="songMenuButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    var willOpen = openMenuId !== song.id;
                    setOpenMenuId(willOpen ? song.id : "");
                    setOpenMenuUp(willOpen ? shouldOpenActionMenuUp(event.currentTarget, 150) : false);
                  }}
                  title="Ações da música"
                >
                  ⋯
                </button>
                {openMenuId === song.id && (
                  <div className={openMenuUp ? "songActionMenu openUp" : "songActionMenu"} onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => { setOpenMenuId(""); props.onEditSong && props.onEditSong(song); }}>Editar</button>
                    <button
                      disabled={isAddingMode && alreadyInRepertoire}
                      onClick={() => {
                        setOpenMenuId("");
                        if (isAddingMode && props.onAddSongToRepertoire) {
                          props.onAddSongToRepertoire(song);
                          return;
                        }
                        if (props.onStartAddSongFlow) {
                          props.onStartAddSongFlow(song);
                        }
                      }}
                    >
                      {isAddingMode && alreadyInRepertoire ? "Já adicionada" : "Adicionar ao Repertório"}
                    </button>
                    <button className="danger" onClick={() => { setOpenMenuId(""); props.onDeleteSong && props.onDeleteSong(song); }}>Excluir</button>
                  </div>
                )}
              </div>
            ) : props.onStartAddSongFlow || (isAddingMode && props.onAddSongToRepertoire) ? (
              <button
                className="plusButton"
                disabled={isAddingMode && alreadyInRepertoire}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isAddingMode && props.onAddSongToRepertoire) {
                    if (!alreadyInRepertoire) {
                      props.onAddSongToRepertoire(song);
                    }
                    return;
                  }

                  props.onStartAddSongFlow && props.onStartAddSongFlow(song);
                }}
              >
                +
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function formatArtistInfo(song: Song) {
  return song.bpm ? song.artist + " · " + song.bpm + " bpm" : song.artist;
}

function MasterScreen(props: { session: AuthSession; users: WorkspaceUserSummary[]; loading: boolean; loadError: boolean; onRetry: (force?: boolean) => void | Promise<void>; onLogout: () => void; onNavigate: (view: ViewName) => void }) {
  var _query = useState("");
  var query = _query[0];
  var setQuery = _query[1];
  var _roleUpdatingId = useState<string | null>(null);
  var roleUpdatingId = _roleUpdatingId[0];
  var setRoleUpdatingId = _roleUpdatingId[1];
  var _statusUpdatingId = useState<string | null>(null);
  var statusUpdatingId = _statusUpdatingId[0];
  var setStatusUpdatingId = _statusUpdatingId[1];
  var normalizedQuery = query.trim().toLowerCase();
  var filteredUsers = normalizedQuery ? props.users.filter(function (user) {
    return user.displayName.toLowerCase().indexOf(normalizedQuery) >= 0 ||
      user.email.toLowerCase().indexOf(normalizedQuery) >= 0 ||
      formatWorkspaceRole(user.role).toLowerCase().indexOf(normalizedQuery) >= 0;
  }) : props.users;
  var activeCount = props.users.filter(function (user) {
    return user.isActive !== false;
  }).length;
  var memberCount = props.users.filter(function (user) {
    return normalizeClientRole(user.role) === "member";
  }).length;
  var viewerCount = props.users.filter(function (user) {
    return normalizeClientRole(user.role) === "viewer";
  }).length;

  function handleRoleChange(user: WorkspaceUserSummary, role: WorkspaceRole) {
    if (user.isAppMaster || normalizeClientRole(user.role) === role || roleUpdatingId) {
      return;
    }

    setRoleUpdatingId(user.id);
    apiRequest<WorkspaceUserSummary>("PUT", "/users/" + encodeURIComponent(user.id) + "/role", { role: role }).then(function () {
      return props.onRetry(true);
    }).catch(function (error) {
      console.warn("Nao foi possivel alterar a permissao do usuario.", error);
    }).then(function () {
      setRoleUpdatingId(null);
    });
  }

  function handleStatusChange(user: WorkspaceUserSummary, isActive: boolean) {
    if (user.isAppMaster || user.id === props.session.user.id || (user.isActive !== false) === isActive || statusUpdatingId) {
      return;
    }

    setStatusUpdatingId(user.id);
    apiRequest<WorkspaceUserSummary>("PUT", "/users/" + encodeURIComponent(user.id) + "/status", { isActive: isActive }).then(function () {
      return props.onRetry(true);
    }).catch(function (error) {
      console.warn("Nao foi possivel alterar o status do usuario.", error);
    }).then(function () {
      setStatusUpdatingId(null);
    });
  }

  return (
    <div className="accountPage masterPage">
      <main className="accountPanel masterPanel">
        <div className="accountBrandMark">LF</div>
        <h1>Área Master</h1>
        <p className="accountHint">Controle usuários e acessos do LouvorFlow.</p>

        <section className="masterSummary" aria-label="Resumo de usuários">
          <div className="masterStat">
            <span>Total</span>
            <strong>{props.users.length}</strong>
          </div>
          <div className="masterStat">
            <span>Ativos</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="masterStat">
            <span>Membros</span>
            <strong>{memberCount}</strong>
          </div>
          <div className="masterStat">
            <span>Leitura</span>
            <strong>{viewerCount}</strong>
          </div>
        </section>

        <label className="masterSearchLabel">
          <span>Usuários</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Buscar usuário" />
        </label>

        <section className="masterUserList" aria-label="Usuários do workspace">
          {props.loading ? (
            <div className="listLoading masterListLoading">
              <span className="listSpinner" aria-hidden="true" />
              <span>Carregando usuários...</span>
            </div>
          ) : null}

          {!props.loading && props.loadError ? (
            <div className="masterListError">
              <p>Não foi possível carregar os usuários.</p>
              <button type="button" onClick={() => props.onRetry(true)}>Tentar novamente</button>
            </div>
          ) : null}

          {!props.loading && !props.loadError ? filteredUsers.map(function (user) {
            var normalizedRole = normalizeClientRole(user.role);
            var isCurrentUser = user.id === props.session.user.id;
            var isActive = user.isActive !== false;
            return (
              <article className={isCurrentUser ? "masterUserRow masterUserRowCurrent" : "masterUserRow"} key={user.id}>
                <div className="masterUserAvatar" aria-hidden="true">{getWorkspaceUserInitial(user)}</div>
                <div className="masterUserInfo">
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </div>
                <div className="masterUserBadges">
                  {user.isAppMaster ? <span className="masterBadge masterBadgeAccent">App master</span> : null}
                  {user.isAppMaster ? (
                    <span className="masterBadge">{formatWorkspaceRole(user.role)}</span>
                  ) : (
                    <label className="masterRoleControl">
                      <span>Permissão</span>
                      <select
                        value={normalizedRole}
                        disabled={roleUpdatingId === user.id}
                        onChange={(event) => handleRoleChange(user, normalizeClientRole(event.currentTarget.value))}
                      >
                        <option value="master">Master</option>
                        <option value="member">Membro</option>
                        <option value="viewer">Leitura</option>
                      </select>
                    </label>
                  )}
                  {user.isAppMaster || isCurrentUser ? (
                    <span className={isActive ? "masterBadge masterBadgeSuccess" : "masterBadge masterBadgeDanger"}>{isActive ? "Ativo" : "Inativo"}</span>
                  ) : (
                    <label className="masterStatusControl">
                      <span>Status</span>
                      <select
                        className={isActive ? "isActive" : "isInactive"}
                        value={isActive ? "active" : "inactive"}
                        disabled={statusUpdatingId === user.id}
                        onChange={(event) => handleStatusChange(user, event.currentTarget.value === "active")}
                      >
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </label>
                  )}
                </div>
              </article>
            );
          }) : null}

          {!props.loading && !props.loadError && !filteredUsers.length ? <p className="masterEmptyText">Nenhum usuário encontrado.</p> : null}
        </section>

        <button className="accountLogoutButton" onClick={props.onLogout}>Sair</button>
      </main>
      <BottomNav active="account" onNavigate={props.onNavigate} />
    </div>
  );
}

function formatWorkspaceRole(role: WorkspaceRole) {
  var normalizedRole = normalizeClientRole(role);
  if (normalizedRole === "master") {
    return "Master";
  }

  if (normalizedRole === "member") {
    return "Membro";
  }

  return "Leitura";
}

function getWorkspaceUserInitial(user: WorkspaceUserSummary) {
  var source = user.displayName || user.email || "U";
  return source.charAt(0).toUpperCase();
}

function AccountScreen(props: { session: AuthSession | null; notice?: string; legacyMode?: boolean; syncing?: boolean; onLogin: (session: AuthSession) => void; onLogout: () => void; onNavigate: (view: ViewName) => void }) {
  var _mode = useState<"login" | "register">("login");
  var mode = _mode[0];
  var setMode = _mode[1];
  var _displayName = useState("");
  var displayName = _displayName[0];
  var setDisplayName = _displayName[1];
  var _email = useState("");
  var email = _email[0];
  var setEmail = _email[1];
  var _password = useState("");
  var password = _password[0];
  var setPassword = _password[1];
  var _touchedFields = useState({
    displayName: false,
    email: false,
    password: false
  });
  var touchedFields = _touchedFields[0];
  var setTouchedFields = _touchedFields[1];
  var _showPassword = useState(false);
  var showPassword = _showPassword[0];
  var setShowPassword = _showPassword[1];
  var _loading = useState(false);
  var loading = _loading[0];
  var setLoading = _loading[1];
  var _error = useState("");
  var error = _error[0];
  var setError = _error[1];
  var emailMissing = touchedFields.email && !email.trim();
  var passwordMissing = touchedFields.password && !password.trim();
  var displayNameMissing = mode === "register" && touchedFields.displayName && !displayName.trim();
  var canSubmit = mode === "login" ? Boolean(email.trim() && password.trim()) : Boolean(displayName.trim() && email.trim() && password.trim());

  function touchField(fieldName: "displayName" | "email" | "password") {
    setTouchedFields(function (currentFields) {
      return {
        ...currentFields,
        [fieldName]: true
      };
    });
  }

  function touchRequiredFields() {
    setTouchedFields({
      displayName: mode === "register",
      email: true,
      password: true
    });
  }

  function submitLogin(event: React.FormEvent) {
    event.preventDefault();

    if (loading || !canSubmit) {
      touchRequiredFields();
      return;
    }

    setLoading(true);
    setError("");

    apiRequest<AuthSession>("POST", "/auth/login", {
      email: email,
      password: password
    }).then(function (session) {
      props.onLogin(session);
      setPassword("");
    }).catch(function () {
      setError("Não foi possível entrar. Verifique seu e-mail e senha.");
    }).then(function () {
      setLoading(false);
    });
  }

  function submitRegister(event: React.FormEvent) {
    event.preventDefault();

    if (loading || !canSubmit) {
      touchRequiredFields();
      return;
    }

    setLoading(true);
    setError("");

    apiRequest<AuthSession>("POST", "/auth/register", {
      displayName: displayName,
      email: email,
      password: password
    }).then(function (session) {
      props.onLogin(session);
      setPassword("");
      setDisplayName("");
    }).catch(function (error) {
      var errorMessage = error instanceof Error ? error.message : "";
      setError(errorMessage || "Não foi possível criar a conta. Verifique os dados e tente novamente.");
    }).then(function () {
      setLoading(false);
    });
  }

  function toggleMode() {
    var nextMode: "login" | "register" = mode === "login" ? "register" : "login";
    setMode(nextMode);
    setEmail("");
    setDisplayName("");
    setError("");
    setPassword("");
    setTouchedFields({
      displayName: false,
      email: false,
      password: false
    });
  }

  if (props.syncing && !props.session) {
    return (
      <div className="accountPage">
        <main className="accountPanel accountVerifyPanel">
          <div className="accountBrandMark">LF</div>
          <h1>LouvorFlow</h1>
          <div className="accountSyncText">
            <span className="listSpinner" aria-hidden="true" />
            <span>Verificando acesso...</span>
          </div>
        </main>
      </div>
    );
  }

  if (props.syncing) {
    return (
      <div className="accountPage">
        <main className="accountPanel accountSignedPanel">
          <div className="accountBrandMark">LF</div>
          <h1>LouvorFlow</h1>
          <p className="accountHint">Conta conectada ao repertório da equipe.</p>
          <div className="accountSyncText">
            <span className="listSpinner" aria-hidden="true" />
            <span>Sincronizando sessão...</span>
          </div>
        </main>
        <BottomNav active="account" onNavigate={props.onNavigate} />
      </div>
    );
  }

  if (props.session) {
    return (
      <div className="accountPage">
        <main className="accountPanel accountSignedPanel">
          <div className="accountBrandMark">LF</div>
          <h1>LouvorFlow</h1>
          <p className="accountHint">Conta conectada ao repertório da equipe.</p>

          <div className="accountSessionCard">
            <span>Usuário</span>
            <strong>{props.session.user.displayName}</strong>
            <small>{props.session.user.email}</small>
          </div>

          <div className="accountSessionCard">
            <span>Workspace</span>
            <strong>{props.session.workspace.name}</strong>
            <small>{props.session.workspace.role}</small>
          </div>

          <button className="accountLogoutButton" onClick={props.onLogout}>Sair</button>
        </main>
        <BottomNav active="account" onNavigate={props.onNavigate} />
      </div>
    );
  }

  return (
    <div className="accountPage">
      <main className="accountPanel">
        <div className="accountBrandMark">LF</div>
        <h1>LouvorFlow</h1>
        <p className="accountHint">{mode === "login" ? "Entre com sua conta para acessar seu repertorio." : "Crie sua conta para acessar o LouvorFlow."}</p>

        <form className="accountForm" onSubmit={mode === "login" ? submitLogin : submitRegister}>
          {mode === "register" ? (
            <label className={displayNameMissing ? "accountFieldInvalid" : ""}>
              <span className="accountLabelRow">
                <span>Nome</span>
                {displayNameMissing ? <span className="accountFieldError">campo obrigatorio</span> : null}
              </span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                onBlur={() => touchField("displayName")}
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className={emailMissing ? "accountFieldInvalid" : ""}>
            <span className="accountLabelRow">
              <span>E-mail ou Usuario</span>
              {emailMissing ? <span className="accountFieldError">campo obrigatorio</span> : null}
            </span>
            <input
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              onBlur={() => touchField("email")}
              autoComplete="username"
              inputMode="email"
            />
          </label>

          <label className={passwordMissing ? "accountFieldInvalid" : ""}>
            <span className="accountLabelRow">
              <span>Senha</span>
              {passwordMissing ? <span className="accountFieldError">campo obrigatorio</span> : null}
            </span>
            <span className="passwordField">
              <input
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                onBlur={() => touchField("password")}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                title={showPassword ? "Ocultar senha" : "Ver senha"}
              >
                <PasswordEyeIcon isVisible={showPassword} />
              </button>
            </span>
          </label>

          {error || props.notice ? <p className="accountError">{error || props.notice}</p> : null}

          <button className="primaryButton accountPrimaryButton" type="submit" disabled={loading || !canSubmit}>
            {loading ? (mode === "login" ? "Entrando..." : "Criando...") : (mode === "login" ? "Entrar" : "Criar conta")}
          </button>
        </form>

        {!props.legacyMode ? (
          <button className="accountModeButton" type="button" onClick={toggleMode}>
            {mode === "login" ? "Criar conta" : "Já tenho conta"}
          </button>
        ) : null}
      </main>
    </div>
  );
}

function AccountLoadingScreen() {
  return (
    <main className="accountPage">
      <section className="accountPanel accountLoadingPanel">
        <div className="accountBrandMark">LF</div>
        <h1>LouvorFlow</h1>
        <p className="accountHint">Carregando sessão...</p>
      </section>
    </main>
  );
}

function BottomNav(props: { active: string; onNavigate: (view: ViewName) => void }) {
  return (
    <nav className="bottomNav">
      <button className={props.active === "search" ? "active" : ""} onClick={() => props.onNavigate("search")}>
        <span>⌂</span>Pesquisar
      </button>
      <button className={props.active === "library" ? "active" : ""} onClick={() => props.onNavigate("library")}>
        <span>▤</span>Biblioteca
      </button>
      <button className={props.active === "repertoires" ? "active" : ""} onClick={() => props.onNavigate("repertoires")}>
        <span>♬</span>Repertórios
      </button>
      <button className={props.active === "account" ? "active" : ""} onClick={() => props.onNavigate("account")}>
        <span>◉</span>Conta
      </button>
    </nav>
  );
}

function SongScreen(props: { song: Song; onBack: () => void; onChangeKey: (key: NoteName) => void; onStartAddSongFlow?: (song: Song) => void }) {
  var viewportWidth = useViewportWidth();
  var chartViewportRef = useRef<HTMLDivElement>(null);
  var _settingsOpen = useState(false);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  var _activeSection = useState(props.song.sections[0].id);
  var activeSection = _activeSection[0];
  var setActiveSection = _activeSection[1];

  useLegacyScrollBoundary(chartViewportRef, !settingsOpen);

  function selectSection(sectionId: string) {
    setActiveSection(sectionId);

    if (typeof window === "undefined") {
      return;
    }

    window.setTimeout(function () {
      var target = document.getElementById("section-" + sectionId);
      var chartViewport = chartViewportRef.current;
      if (target && chartViewport) {
        if (viewportWidth > 900 && chartViewport.closest(".legacyVisualMode")) {
          return;
        }

        var viewportTop = chartViewport.getBoundingClientRect().top;
        var targetTop = target.getBoundingClientRect().top;
        var topOffset = 12;
        if (viewportWidth > 900) {
          var chartViewportStyle = window.getComputedStyle ? window.getComputedStyle(chartViewport) : null;
          topOffset = chartViewportStyle ? parseFloat(chartViewportStyle.paddingTop || "0") || 0 : 0;
        }
        chartViewport.scrollTop = chartViewport.scrollTop + targetTop - viewportTop - topOffset;
      }
    }, 0);
  }

  return (
    <div className={settingsOpen ? "songScreen dimmed" : "songScreen"}>
      <div className="songStickyHeader">
        <header className="songTopbar">
          <button className="iconButton plain" onClick={props.onBack}>‹</button>
          <h1>{props.song.title}</h1>
          <div className="songActions">
            <button className="keyButton" onClick={() => setSettingsOpen(true)}>{props.song.currentKey}</button>
          </div>
        </header>

        <nav className="sectionRail">
          {props.song.sections.map(function (section) {
            return (
              <button
                className={activeSection === section.id ? "sectionDot active " + section.kind : "sectionDot " + section.kind}
                key={section.id}
                onClick={() => selectSection(section.id)}
              >
                {section.code}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="songChartViewport" ref={chartViewportRef}>
        <main className="chartGrid">
          {props.song.sections.map(function (section) {
            return <SectionCard key={section.id} section={section} active={activeSection === section.id} viewportWidth={viewportWidth} preserveLayout={true} />;
          })}
        </main>
      </div>

      {props.onStartAddSongFlow ? (
        <button className="floatingRepertoire" onClick={() => props.onStartAddSongFlow && props.onStartAddSongFlow(props.song)}>+ Repertório</button>
      ) : null}

      {settingsOpen && (
        <ChordSettings
          song={props.song}
          onClose={() => setSettingsOpen(false)}
          onChangeKey={props.onChangeKey}
        />
      )}
    </div>
  );
}

function useViewportWidth() {
  var _width = useState(typeof window === "undefined" ? 1200 : window.innerWidth);
  var width = _width[0];
  var setWidth = _width[1];

  useEffect(function () {
    function updateWidth() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", updateWidth);
    return function () {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return width;
}

function SectionCard(props: { section: SongSection; active: boolean; viewportWidth: number; preserveLayout?: boolean }) {
  var measurement = useMeasuredWidth();
  var lineWidth = measurement.width || props.viewportWidth;
  var cardClassName = (props.active ? "sectionCard active " + props.section.kind : "sectionCard " + props.section.kind) + (props.preserveLayout ? " preserveLayout" : "");

  return (
    <section className={cardClassName} id={"section-" + props.section.id}>
      <header>
        <span className={"sectionBadge " + props.section.kind}>{props.section.code}</span>
        <h2>{props.section.name}</h2>
        {props.section.note && <small>{props.section.note}</small>}
      </header>
      <div className="sectionLines" ref={measurement.ref}>
        {props.section.lines.map(function (line, index) {
          return <ChordLine key={index} line={line} lineWidth={lineWidth} preserveLayout={props.preserveLayout} />;
        })}
      </div>
    </section>
  );
}

function useMeasuredWidth() {
  var ref = useRef<HTMLDivElement | null>(null);
  var _width = useState(0);
  var width = _width[0];
  var setWidth = _width[1];

  useEffect(function () {
    function updateWidth() {
      if (ref.current) {
        setWidth(ref.current.getBoundingClientRect().width);
      }
    }

    updateWidth();
    window.setTimeout(updateWidth, 0);
    window.addEventListener("resize", updateWidth);
    return function () {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return { ref: ref, width: width };
}

function ChordLine(props: { line: { lyric: string; chords: { value: string; position: number }[] }; lineWidth: number; preserveLayout?: boolean }) {
  if (!props.line.lyric && !props.line.chords.length) {
    return <div className="chordLine blankLine" aria-hidden="true">&nbsp;</div>;
  }

  if (!props.line.lyric) {
    return (
      <div className="chordLine instrumental">
        <pre className="instrumentalText">{buildChordText(props.line.chords)}</pre>
      </div>
    );
  }

  if (props.preserveLayout) {
    return (
      <div className="chordLine">
        <pre className="chordText">{buildChordText(props.line.chords) || "\u00A0"}</pre>
        <div className="lyric">{props.line.lyric || "\u00A0"}</div>
      </div>
    );
  }

  var parts = splitChordLine(props.line, getLineLimit(props.lineWidth));

  return (
    <>
      {parts.map(function (part, index) {
        return (
          <div className="chordLine" key={index}>
            <pre className="chordText">{buildChordText(part.chords) || "\u00A0"}</pre>
            <div className="lyric">{part.lyric || "\u00A0"}</div>
          </div>
        );
      })}
    </>
  );
}

function getLineLimit(lineWidth: number) {
  return Math.max(18, Math.min(76, Math.floor(lineWidth / 11)));
}

function splitChordLine(line: { lyric: string; chords: { value: string; position: number }[] }, limit: number) {
  var chordEnd = line.chords.reduce(function (max, chord) {
    return Math.max(max, chord.position + chord.value.length);
  }, 0);
  var lineLength = Math.max(line.lyric.length, chordEnd);

  if (lineLength <= limit) {
    return [line];
  }

  var parts: { lyric: string; chords: { value: string; position: number }[] }[] = [];
  var start = 0;

  while (start < lineLength) {
    var end = Math.min(start + limit, lineLength);
    var breakAt = end;

    if (end < lineLength && end < line.lyric.length) {
      var space = line.lyric.lastIndexOf(" ", end);
      if (space > start + 8) {
        breakAt = space;
      }
    }

    var lyric = line.lyric.slice(start, breakAt).trimEnd();
    var segmentStart = start;
    var segmentEnd = breakAt;
    var chords = line.chords
      .filter(function (chord) {
        return chord.position >= segmentStart && chord.position < segmentEnd;
      })
      .map(function (chord) {
        return {
          value: chord.value,
          position: Math.max(0, chord.position - segmentStart)
        };
      });

    parts.push({ lyric: lyric, chords: chords });
    start = breakAt + (line.lyric.charAt(breakAt) === " " ? 1 : 0);
  }

  return parts;
}

function buildChordText(chords: { value: string; position: number }[]) {
  var output = "";

  chords.forEach(function (chord) {
    var target = Math.max(chord.position, output.length + (output.length ? 1 : 0));

    while (output.length < target) {
      output += " ";
    }

    output += chord.value;
  });

  return output;
}

function DeleteSongDialog(props: { song: Song; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modalOverlay confirmOverlay">
      <section className="confirmDialog">
        <h2>Excluir música</h2>
        <p>Tem certeza que deseja excluir "{props.song.title}"?</p>
        <small>Essa ação não pode ser desfeita.</small>
        <div className="confirmActions">
          <button className="secondaryButton" onClick={props.onCancel}>Cancelar</button>
          <button className="dangerButton" onClick={props.onConfirm}>Excluir</button>
        </div>
      </section>
    </div>
  );
}

function DeleteRepertoireDialog(props: { repertoire: Repertoire; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modalOverlay confirmOverlay">
      <section className="confirmDialog">
        <h2>Excluir repertório</h2>
        <p>Tem certeza que deseja excluir "{props.repertoire.name}"?</p>
        <small>Essa ação não pode ser desfeita.</small>
        <div className="confirmActions">
          <button className="secondaryButton" onClick={props.onCancel}>Cancelar</button>
          <button className="dangerButton" onClick={props.onConfirm}>Excluir</button>
        </div>
      </section>
    </div>
  );
}

function ChordSettings(props: { song: Song; onClose: () => void; onChangeKey: (key: NoteName) => void }) {
  var _accidentalMode = useState<"natural" | "flat" | "sharp">("natural");
  var accidentalMode = _accidentalMode[0];
  var setAccidentalMode = _accidentalMode[1];
  var availableKeys = accidentalMode === "flat" ? FLAT_KEYS : accidentalMode === "sharp" ? SHARP_KEYS : NATURAL_KEYS;

  return (
    <div className="modalOverlay">
      <section className="settingsPanel">
        <header>
          <h2>Ajustes de Cifra</h2>
          <button onClick={props.onClose}>Pronto</button>
        </header>
        <div className="settingsBody">
          <label>Anotacoes</label>
          <button className="selectLike">Nenhum <span>⌄</span></button>

          <label className="keySummaryLabel"><span>Tom</span><strong>Original ({props.song.originalKey}) - {props.song.bpm} bpm</strong></label>
          <div className="keyPicker">
            {availableKeys.map(function (key) {
              return (
            <button
                  className={props.song.currentKey === key ? "active" : ""}
                  key={key}
                  onClick={() => props.onChangeKey(key)}
                >
                  {key.replace("b", "♭").replace("#", "♯")}
                </button>
              );
            })}
          </div>
          <div className="accidentals">
            <button className={accidentalMode === "flat" ? "active" : ""} onClick={() => setAccidentalMode(accidentalMode === "flat" ? "natural" : "flat")}>♭</button>
            <button className={accidentalMode === "sharp" ? "active" : ""} onClick={() => setAccidentalMode(accidentalMode === "sharp" ? "natural" : "sharp")}>♯</button>
          </div>

        </div>
      </section>
    </div>
  );
}

function showFatalError(error: unknown) {
  var root = document.getElementById("root");
  var message = error instanceof Error ? error.message : String(error);

  if (!root) {
    return;
  }

  root.innerHTML = '<div class="fatalError"><strong>Erro ao abrir a tela.</strong><span>' + escapeHtml(message) + "</span></div>";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.onerror = function (_message, _source, _lineno, _colno, error) {
  showFatalError(error || _message);
};

try {
  createRoot(document.getElementById("root") as HTMLElement).render(<App />);
} catch (error) {
  showFatalError(error);
}
