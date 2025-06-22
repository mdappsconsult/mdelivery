import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { GoogleMap, LoadScript, Polygon, Marker } from '@react-google-maps/api';
import { 
  Box, 
  Heading, 
  Input, 
  Button, 
  Text, 
  useToast, 
  VStack, 
  Flex, 
  HStack, 
  Container, 
  Divider,
  IconButton,
  useColorMode,
  useColorModeValue,
  Stack,
  useBreakpointValue,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure
} from '@chakra-ui/react';
import { supabase } from '../../lib/supabase';

const GOOGLE_MAPS_KEY = 'AIzaSyD1DL2b2Gy91nOOxiQn5CqlX0fciTER4E0';

// Coordenadas do Brasil
const BRASIL_BOUNDS = {
  north: 5.27438,   // Ponto mais ao norte
  south: -33.75117, // Ponto mais ao sul
  west: -73.98554,  // Ponto mais a oeste
  east: -34.79299   // Ponto mais a leste
};

const defaultCenter = { lat: -15.7801, lng: -47.9292 }; // Brasília
const defaultZoom = 4;

const colors = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080'
];

export default function ZonasPage() {
  const router = useRouter();
  const { telefone } = router.query;
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Valores que mudam com o tema
  const bgColor = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const highlightBorderColor = useColorModeValue('blue.200', 'blue.500');
  const subtitleColor = useColorModeValue('gray.600', 'gray.400');
  const inputBg = useColorModeValue('white', 'gray.700');

  const [zonas, setZonas] = useState([]);
  const [currentZona, setCurrentZona] = useState({ nome: '', pontos: [] });
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingZona, setEditingZona] = useState(null);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultZoom);
  const [hasChanges, setHasChanges] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const [polygonListeners, setPolygonListeners] = useState({});
  const [saveTimeout, setSaveTimeout] = useState(null);
  const activePolygonRef = useRef(null);
  const lastSaveTimeRef = useRef(0);
  const pollingIntervalRef = useRef(null);
  const lastPointsHashRef = useRef('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef();

  useEffect(() => {
    if (telefone) {
      console.log('Telefone carregado:', telefone);
      carregarZonas();
    } else {
      console.log('Telefone ainda não disponível');
    }
  }, [telefone]);

  useEffect(() => {
    // Só ajusta zoom se não estiver editando uma zona
    if (mapInstance && zonas.length > 0 && !editingZona) {
      const bounds = new google.maps.LatLngBounds();
      zonas.forEach(zona => {
        zona.pontos.forEach(point => {
          bounds.extend(new google.maps.LatLng(point.lat, point.lng));
        });
      });
      mapInstance.fitBounds(bounds);

      setTimeout(() => {
        if (mapInstance.getZoom() > 15) {
          mapInstance.setZoom(15);
        }
      }, 100);
    }
  }, [zonas, mapInstance, editingZona]);

  const getPointsHash = (points) => {
    return JSON.stringify(points.map(p => ({ lat: Math.round(p.lat * 1000000), lng: Math.round(p.lng * 1000000) })));
  };

  const savePolygonPoints = useCallback(async (polygon, zonaId) => {
    if (!telefone || !polygon) return;

    try {
      const path = polygon.getPath();
      const newPoints = [];
      
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        newPoints.push({
          lat: point.lat(),
          lng: point.lng()
        });
      }

      const pointsHash = getPointsHash(newPoints);
      
      // Verifica se os pontos realmente mudaram
      if (pointsHash === lastPointsHashRef.current) {
        console.log('⏭️ Pontos não mudaram, pulando salvamento');
        return;
      }

      lastPointsHashRef.current = pointsHash;

      console.log('💾 Salvando alteração - Zona:', zonaId, 'Pontos:', newPoints.length);

      // Atualiza o estado local
      setEditingZona(prev => prev?.id === zonaId ? ({
        ...prev,
        pontos: newPoints
      }) : prev);

      setZonas(prevZonas => 
        prevZonas.map(z => 
          z.id === zonaId 
            ? { ...z, pontos: newPoints }
            : z
        )
      );

      setHasChanges(true);

      // Salva no Supabase
      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          pontos: JSON.stringify(newPoints),
          telefone: telefone
        })
        .eq('id', zonaId);

      if (error) throw error;
      
      console.log('✅ Pontos salvos com sucesso:', newPoints.length, 'pontos para zona', zonaId);

    } catch (error) {
      console.error('❌ Erro ao salvar pontos:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [telefone, toast]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('⏹️ Parando polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((polygon, zonaId) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('🔄 Iniciando polling para zona:', zonaId);

    pollingIntervalRef.current = setInterval(() => {
      if (polygon && polygon.getPath) {
        try {
          savePolygonPoints(polygon, zonaId);
        } catch (error) {
          console.error('Erro no polling:', error);
        }
      }
    }, 500); // Verifica a cada 500ms
  }, [savePolygonPoints]);

  // Limpa polling quando o componente é desmontado
  useEffect(() => {
    return () => {
      stopPolling();
      // Limpa todos os listeners ao desmontar o componente
      Object.values(polygonListeners).forEach(listeners => {
        listeners.forEach(listener => {
          google.maps.event.removeListener(listener);
        });
      });
      
      // Limpa timeout de salvamento se existir
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [stopPolling]);

  // Limpa listeners da zona anterior quando muda de zona de edição
  useEffect(() => {
    if (!editingZona) {
      stopPolling();
      // Remove todos os listeners quando sai do modo de edição
      Object.values(polygonListeners).forEach(listeners => {
        listeners.forEach(listener => {
          google.maps.event.removeListener(listener);
        });
      });
      setPolygonListeners({});
      
      // Limpa timeout de salvamento se existir
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        setSaveTimeout(null);
      }
      
      activePolygonRef.current = null;
      lastPointsHashRef.current = '';
    }
  }, [editingZona, stopPolling]);

  const carregarZonas = async () => {
    try {
      const { data, error } = await supabase
        .from('zonas_entrega')
        .select('*')
        .eq('telefone', telefone);

      if (error) throw error;

      if (data) {
        const zonasFormatadas = data.map(zona => ({
          ...zona,
          pontos: Array.isArray(zona.pontos) ? zona.pontos : JSON.parse(zona.pontos)
        }));
        
        setZonas(zonasFormatadas);

        if (zonasFormatadas.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          zonasFormatadas.forEach(zona => {
            zona.pontos.forEach(point => {
              bounds.extend(new google.maps.LatLng(point.lat, point.lng));
            });
          });
          
          const center = {
            lat: (bounds.getNorthEast().lat() + bounds.getSouthWest().lat()) / 2,
            lng: (bounds.getNorthEast().lng() + bounds.getSouthWest().lng()) / 2
          };
          
          setMapCenter(center);
          setMapZoom(13);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar zonas:', error);
      toast({
        title: "Erro ao carregar zonas",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleMapClick = (e) => {
    if (isDrawing) {
      const newPoint = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };
      setCurrentZona(prev => ({
        ...prev,
        pontos: [...prev.pontos, newPoint]
      }));
    }
  };

  const handleZonaClick = (zona, index) => {
    if (isDrawing) return;
    
    // Para o polling anterior
    stopPolling();
    
    // Se já está editando uma zona, limpa os listeners dela
    if (editingZona && polygonListeners[editingZona.id]) {
      polygonListeners[editingZona.id].forEach(listener => {
        google.maps.event.removeListener(listener);
      });
      setPolygonListeners(prev => {
        const newListeners = { ...prev };
        delete newListeners[editingZona.id];
        return newListeners;
      });
    }
    
    // Reset das referências
    activePolygonRef.current = null;
    lastPointsHashRef.current = '';
    
    setEditingZona({
      ...zona,
      index
    });
    setHasChanges(false);
  };

  const handleVertexDrag = async (e, vertexIndex, zona) => {
    if (!telefone) {
      console.error('Telefone não disponível para salvamento');
      return;
    }

    const newPoints = [...zona.pontos];
    newPoints[vertexIndex] = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };

    // Atualiza o estado local
    setEditingZona(prev => ({
      ...prev,
      pontos: newPoints
    }));

    setZonas(prevZonas => 
      prevZonas.map(z => 
        z.id === zona.id 
          ? { ...z, pontos: newPoints }
          : z
      )
    );

    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          pontos: JSON.stringify(newPoints),
          telefone: telefone
        })
        .eq('id', zona.id);

      if (error) throw error;
      
      setHasChanges(true);
    } catch (error) {
      console.error('Erro ao salvar alteração dos pontos:', error);
      toast({
        title: "Erro ao salvar alteração",
        description: "Não foi possível salvar a alteração dos pontos",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleNewVertexDrag = (e, vertexIndex) => {
    const newPoints = [...currentZona.pontos];
    newPoints[vertexIndex] = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };

    setCurrentZona(prev => ({
      ...prev,
      pontos: newPoints
    }));
  };

  const handleRemoveVertex = async (vertexIndex) => {
    if (!editingZona || editingZona.pontos.length <= 3) {
      toast({
        title: "Não é possível remover",
        description: "Uma zona precisa ter no mínimo 3 pontos",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!telefone) {
      console.error('Telefone não disponível para salvamento');
      toast({
        title: "Erro",
        description: "Telefone não disponível. Recarregue a página.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const newPoints = editingZona.pontos.filter((_, idx) => idx !== vertexIndex);

    // Atualiza o estado local
    setEditingZona(prev => ({
      ...prev,
      pontos: newPoints
    }));

    setZonas(prevZonas => 
      prevZonas.map(z => 
        z.id === editingZona.id 
          ? { ...z, pontos: newPoints }
          : z
      )
    );

    setHasChanges(true);

    // Salva no Supabase
    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          pontos: JSON.stringify(newPoints),
          telefone: telefone
        })
        .eq('id', editingZona.id);

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao salvar alteração dos pontos:', error);
      toast({
        title: "Erro ao salvar alteração",
        description: "Não foi possível salvar a alteração dos pontos",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleNomeChange = (e) => {
    setEditingZona(prev => ({
      ...prev,
      nome: e.target.value
    }));
    setHasChanges(true);
  };

  const salvarEdicao = async () => {
    if (!editingZona) return;

    if (!telefone) {
      toast({
        title: "Erro",
        description: "Telefone não disponível. Recarregue a página.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!editingZona.nome || editingZona.nome.trim() === '') {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, dê um nome para a zona antes de salvar",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      // Prepara os dados para salvar
      const dadosParaSalvar = {
        nome: editingZona.nome.trim(),
        pontos: editingZona.pontos,
        telefone: telefone // Usa o telefone da URL
      };

      console.log('Salvando zona:', dadosParaSalvar);

      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          nome: dadosParaSalvar.nome,
          pontos: JSON.stringify(dadosParaSalvar.pontos),
          telefone: dadosParaSalvar.telefone
        })
        .eq('id', editingZona.id);

      if (error) throw error;

      // Atualiza a zona no estado local
      const newZonas = zonas.map(zona => 
        zona.id === editingZona.id 
          ? { ...zona, nome: dadosParaSalvar.nome, pontos: dadosParaSalvar.pontos }
          : zona
      );
      setZonas(newZonas);

      toast({
        title: "Zona atualizada",
        description: "As alterações foram salvas com sucesso",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Limpa o estado de edição
      setEditingZona(null);
      setCurrentZona({ nome: '', pontos: [] });
      setHasChanges(false);
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const cancelarEdicao = () => {
    stopPolling();
    
    // Limpa listeners da zona que estava sendo editada
    if (editingZona && polygonListeners[editingZona.id]) {
      polygonListeners[editingZona.id].forEach(listener => {
        google.maps.event.removeListener(listener);
      });
      setPolygonListeners(prev => {
        const newListeners = { ...prev };
        delete newListeners[editingZona.id];
        return newListeners;
      });
    }

    activePolygonRef.current = null;
    lastPointsHashRef.current = '';
    setEditingZona(null);
    setCurrentZona({ nome: '', pontos: [] });
    setHasChanges(false);
    carregarZonas();
  };

  const salvarZona = async () => {
    if (!telefone) {
      toast({
        title: "Erro",
        description: "Telefone não disponível. Recarregue a página.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!currentZona.nome || currentZona.nome.trim() === '') {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, dê um nome para a zona antes de salvar",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (currentZona.pontos.length < 3) {
      toast({
        title: "Pontos insuficientes",
        description: "A zona precisa ter no mínimo 3 pontos",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      console.log('Salvando nova zona com telefone:', telefone);
      const { error } = await supabase
        .from('zonas_entrega')
        .insert([
          {
            telefone,
            nome: currentZona.nome.trim(),
            pontos: JSON.stringify(currentZona.pontos)
          }
        ]);

      if (error) throw error;

      toast({
        title: "Zona salva",
        description: "A nova zona foi salva com sucesso",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      setCurrentZona({ nome: '', pontos: [] });
      setIsDrawing(false);
      await carregarZonas();
    } catch (error) {
      console.error('Erro ao salvar zona:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const calcularCentro = (pontos) => {
    const lat = pontos.reduce((sum, p) => sum + p.lat, 0) / pontos.length;
    const lng = pontos.reduce((sum, p) => sum + p.lng, 0) / pontos.length;
    return { lat, lng };
  };

  const excluirZona = async () => {
    if (!editingZona) return;

    onClose(); // Fecha o dialog de confirmação

    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .delete()
        .eq('id', editingZona.id);

      if (error) throw error;

      // Remove a zona do estado local imediatamente
      const newZonas = zonas.filter(zona => zona.id !== editingZona.id);
      setZonas(newZonas);

      // Para o polling se estiver ativo
      stopPolling();

      // Limpa o estado de edição
      setEditingZona(null);
      setCurrentZona({ nome: '', pontos: [] });
      setHasChanges(false);

      // Atualiza o zoom do mapa para mostrar todas as zonas restantes
      if (mapInstance && newZonas.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        newZonas.forEach(zona => {
          zona.pontos.forEach(point => {
            bounds.extend(new google.maps.LatLng(point.lat, point.lng));
          });
        });
        mapInstance.fitBounds(bounds);

        // Ajusta o zoom máximo
        setTimeout(() => {
          if (mapInstance.getZoom() > 15) {
            mapInstance.setZoom(15);
          }
        }, 100);
      } else if (mapInstance) {
        // Se não houver mais zonas, volta para a visualização padrão
        mapInstance.setCenter(defaultCenter);
        mapInstance.setZoom(defaultZoom);
      }

      toast({
        title: "Zona excluída",
        description: "A zona foi excluída com sucesso",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Erro ao excluir zona:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleMapLoad = (map) => {
    setMapInstance(map);
  };

  const limparDesenho = () => {
    setCurrentZona({ nome: '', pontos: [] });
    toast({
      title: "Desenho limpo",
      description: "O desenho atual foi limpo",
      status: "info",
      duration: 2000,
      isClosable: true,
    });
  };

  const handleVertexMouseDown = (vertexIndex) => {
    // Inicia o temporizador de clique longo (500ms)
    const timer = setTimeout(() => {
      setIsLongPress(true);
      handleRemoveVertex(vertexIndex);
    }, 500);
    
    setLongPressTimer(timer);
  };

  const handleVertexMouseUp = () => {
    // Limpa o temporizador se o mouse for solto antes do tempo
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPress(false);
  };

  const handleVertexClick = (e, vertexIndex) => {
    // Previne a remoção do vértice no clique normal se foi um clique longo
    if (!isLongPress) {
      e.stopPropagation();
    }
  };

  const setupPolygonListeners = useCallback((polygon, zona) => {
    if (!telefone) {
      console.error('Telefone não disponível para configurar listeners');
      return;
    }

    // Remove listeners anteriores
    if (polygonListeners[zona.id]) {
      polygonListeners[zona.id].forEach(listener => {
        google.maps.event.removeListener(listener);
      });
    }

    activePolygonRef.current = polygon;
    console.log('🔧 Configurando listeners para zona:', zona.id);

    // Inicia o polling para esta zona
    startPolling(polygon, zona.id);

    const listeners = [];

    // Listener básico para detectar quando o usuário começa a editar
    const mouseDownListener = google.maps.event.addListener(polygon, 'mousedown', () => {
      console.log('🖱️ Mouse down no polígono - usuário começou a editar');
    });

    listeners.push(mouseDownListener);

    setPolygonListeners(prev => ({
      ...prev,
      [zona.id]: listeners
    }));

    console.log('✅ Sistema de detecção configurado para zona', zona.id);
  }, [telefone, startPolling]);

  return (
    <Box p={4} bg={bgColor} minH="100vh">
      <Container maxW="container.xl">
        <VStack spacing={6} align="stretch">
          {/* Cabeçalho com logomarca e instruções */}
          <Box
            bg={cardBg}
            p={6}
            borderRadius="xl"
            borderWidth="1px"
            borderColor={borderColor}
            shadow="lg"
            bgGradient="linear(to-r, blue.50, purple.50)"
            _dark={{
              bgGradient: "linear(to-r, blue.900, purple.900)"
            }}
          >
            <VStack spacing={4} align="center">
              {/* Logomarca MDelivery */}
              <Heading
                size="3xl"
                fontWeight="extrabold"
                fontFamily="Inter, system-ui, sans-serif"
                bgGradient="linear(to-r, orange.400, red.500, pink.600)"
                bgClip="text"
                letterSpacing="tighter"
                textAlign="center"
                textShadow="0 2px 4px rgba(0,0,0,0.1)"
              >
                MDelivery
              </Heading>
              
              {/* Subtítulo */}
              <Text
                fontSize="lg"
                color={subtitleColor}
                fontWeight="medium"
                textAlign="center"
                fontFamily="Inter, system-ui, sans-serif"
              >
                Gerenciando zonas de entregas
              </Text>
              
              {/* Instruções de uso */}
              <Box
                bg={bgColor}
                p={3}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
                w="100%"
                maxW="500px"
              >
                <Text
                  fontSize="sm"
                  color={textColor}
                  textAlign="center"
                  lineHeight="1.5"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  Clique em "Desenhar Zona" para criar uma área. Para editar, 
                  clique na zona e arraste os pontos vermelhos ou arestas.
                </Text>
              </Box>
            </VStack>
          </Box>

          {/* Controles de zona */}
          <Box
            bg={cardBg}
            p={6}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
            shadow="sm"
          >
            <VStack spacing={4} align="stretch">
              {!editingZona && (
                <VStack spacing={4} align="stretch">
                  <Input
                    placeholder="Nome da zona (obrigatório)"
                    value={currentZona.nome}
                    onChange={(e) => setCurrentZona(prev => ({ ...prev, nome: e.target.value }))}
                    bg={inputBg}
                    isDisabled={editingZona !== null}
                  />
                  <HStack spacing={2}>
                    {!isDrawing ? (
                      <Button
                        colorScheme="green"
                        onClick={() => setIsDrawing(true)}
                        leftIcon={<span>✏️</span>}
                        w={["100%", "auto"]}
                      >
                        Desenhar Zona
                      </Button>
                    ) : (
                      <>
                        <Button
                          colorScheme="red"
                          onClick={() => setIsDrawing(false)}
                          leftIcon={<span>⏹️</span>}
                          w={["100%", "auto"]}
                        >
                          Parar Desenho
                        </Button>
                        <Button
                          colorScheme="orange"
                          onClick={limparDesenho}
                          leftIcon={<span>🗑️</span>}
                          w={["100%", "auto"]}
                          isDisabled={currentZona.pontos.length === 0}
                        >
                          Limpar Desenho
                        </Button>
                      </>
                    )}
                    {currentZona.pontos.length >= 3 && !editingZona && (
                      <Button
                        colorScheme="blue"
                        onClick={salvarZona}
                        leftIcon={<span>💾</span>}
                        w={["100%", "auto"]}
                        isDisabled={!currentZona.nome || currentZona.nome.trim() === ''}
                      >
                        Salvar Zona
                      </Button>
                    )}
                  </HStack>
                </VStack>
              )}

              {editingZona && (
                <VStack spacing={4} align="stretch" mb={4}>
                  <Input
                    placeholder="Nome da zona (obrigatório)"
                    value={editingZona.nome || ''}
                    onChange={handleNomeChange}
                    bg={inputBg}
                  />
                  <HStack spacing={2} justify="flex-end">
                    <Button
                      colorScheme="blue"
                      onClick={salvarEdicao}
                      isDisabled={!hasChanges || !editingZona.nome || editingZona.nome.trim() === ''}
                      leftIcon={<span>💾</span>}
                    >
                      Salvar Alterações
                    </Button>
                    <Button
                      onClick={cancelarEdicao}
                      leftIcon={<span>❌</span>}
                    >
                      Cancelar
                    </Button>
                    <Button
                      colorScheme="red"
                      onClick={onOpen}
                      leftIcon={<span>🗑️</span>}
                    >
                      Excluir
                    </Button>
                  </HStack>
                </VStack>
              )}
            </VStack>
          </Box>

          <Box
            bg={cardBg}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
            shadow="sm"
            h="600px"
            position="relative"
            overflow="hidden"
          >
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_KEY}>
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapCenter}
                zoom={mapZoom}
                options={{
                  mapTypeId: 'hybrid',
                  styles: [
                    {
                      featureType: 'all',
                      elementType: 'labels',
                      stylers: [{ visibility: 'on' }]
                    }
                  ],
                  mapTypeControl: !isMobile,
                  streetViewControl: !isMobile,
                  fullscreenControl: true,
                  zoomControl: true,
                  minZoom: 4,
                  maxZoom: 18,
                  restriction: {
                    latLngBounds: BRASIL_BOUNDS,
                    strictBounds: false
                  }
                }}
                onClick={handleMapClick}
                onLoad={handleMapLoad}
              >
                {zonas.map((zona, index) => (
                  <div key={zona.id}>
                    {(!editingZona || editingZona.id !== zona.id) && (
                      <Polygon
                        paths={zona.pontos}
                        options={{
                          fillColor: colors[index % colors.length],
                          fillOpacity: 0.2,
                          strokeColor: colors[index % colors.length],
                          strokeWeight: 1.5,
                          clickable: !isDrawing,
                          draggable: false,
                          editable: false,
                          geodesic: true
                        }}
                        onClick={() => handleZonaClick(zona, index)}
                      />
                    )}
                    {editingZona?.id === zona.id && (
                      <>
                        <Polygon
                          paths={editingZona.pontos}
                          options={{
                            fillColor: colors[index % colors.length],
                            fillOpacity: 0.3,
                            strokeColor: '#FF0000',
                            strokeWeight: 2.5,
                            strokeOpacity: 1,
                            clickable: true,
                            draggable: false,
                            editable: true,
                            geodesic: true,
                            polylineOptions: {
                              strokeColor: '#FF0000',
                              strokeWeight: 2.5,
                              strokeOpacity: 1
                            }
                          }}
                          onLoad={(polygon) => setupPolygonListeners(polygon, zona)}
                        />
                        {editingZona.pontos.map((point, vertexIndex) => (
                          <Marker
                            key={`vertex-${vertexIndex}-${point.lat}-${point.lng}`}
                            position={point}
                            draggable={true}
                            icon={{
                              path: google.maps.SymbolPath.CIRCLE,
                              scale: 6,
                              fillColor: '#FF0000',
                              fillOpacity: 1,
                              strokeWeight: 2,
                              strokeColor: '#FFFFFF'
                            }}
                            onDragEnd={(e) => handleVertexDrag(e, vertexIndex, zona)}
                            onMouseDown={() => handleVertexMouseDown(vertexIndex)}
                            onMouseUp={handleVertexMouseUp}
                            onMouseLeave={handleVertexMouseUp}
                          />
                        ))}
                      </>
                    )}
                    <Marker
                      position={calcularCentro(zona.pontos)}
                      label={{
                        text: zona.nome || '',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    />
                  </div>
                ))}
                {currentZona.pontos.length > 0 && (
                  <>
                    <Polygon
                      paths={currentZona.pontos}
                      options={{
                        fillColor: '#2B6CB0',
                        fillOpacity: 0.2,
                        strokeColor: '#2B6CB0',
                        strokeWeight: 2
                      }}
                    />
                    {currentZona.pontos.map((point, vertexIndex) => (
                      <Marker
                        key={`new-vertex-${vertexIndex}`}
                        position={point}
                        draggable={true}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 6,
                          fillColor: '#2B6CB0',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#FFFFFF'
                        }}
                        onDragEnd={(e) => handleNewVertexDrag(e, vertexIndex)}
                        onClick={() => handleRemoveVertex(vertexIndex)}
                      />
                    ))}
                    {currentZona.nome && (
                      <Marker
                        position={calcularCentro(currentZona.pontos)}
                        label={{
                          text: currentZona.nome,
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      />
                    )}
                  </>
                )}
              </GoogleMap>
            </LoadScript>
          </Box>
        </VStack>
      </Container>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Confirmar Exclusão
            </AlertDialogHeader>

            <AlertDialogBody>
              Tem certeza que deseja excluir a zona "{editingZona?.nome}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>
                Cancelar
              </Button>
              <Button colorScheme="red" onClick={excluirZona} ml={3}>
                Excluir
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
} 